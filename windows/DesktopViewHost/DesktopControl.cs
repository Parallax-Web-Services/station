using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace Parallax.Station.DesktopViewHost;

internal sealed record ControlRequest(string HostId,string MonitorId,string LayoutRevision,string? LeaseId=null,long Sequence=0,string? Type=null,double? U=null,double? V=null,string? Button=null,int? Key=null);
internal sealed class ControlFailure(int status,string message):Exception(message){internal int Status=>status;}

// Exactly one selected monitor owns input. No packet queues or command retries.
internal sealed class DesktopControl:IDisposable
{
    private sealed class Lease(string id,string monitor,string revision)
    {
        internal readonly string Id=id,MonitorId=monitor,Revision=revision;
        internal DateTimeOffset Expires=DateTimeOffset.UtcNow.AddSeconds(5);
        internal long Sequence;internal long Deadline=Environment.TickCount64+5000;
        internal readonly HashSet<int> Keys=[];
        internal readonly HashSet<string> Buttons=[];
    }
    private readonly object gate=new();private readonly string hostId;private readonly Timer timer;private readonly IntPtr testWindow;
    private Lease? lease;private bool allowed;private IntPtr inputWindow;private long rateWindow;private int rateCount;
    internal DesktopControl(string hostId,IntPtr testWindow=default){this.hostId=hostId;this.testWindow=testWindow;timer=new Timer(_=>{lock(gate){Expire();}},null,250,250);}
    internal bool Allowed{get{lock(gate)return allowed;}set{lock(gate){if(!value)Release();allowed=value;}}}
    internal string Status{get{lock(gate){Expire();return lease is null?"No device is controlling this host.":$"Control active · selected monitor · expires {lease.Expires:HH:mm:ss} UTC";}}}
    internal object Acquire(ControlRequest request)
    {
        lock(gate)
        {
            Expire();var inventory=ValidateScope(request);
            if(!allowed)throw new ControlFailure(403,"Enable control in the host window first.");
            if(lease is not null)throw new ControlFailure(409,"A control lease is already active. Release it before changing monitors.");
            CheckDesktop();lease=new(Convert.ToHexString(RandomNumberGenerator.GetBytes(24)),request.MonitorId,inventory.Revision);
            return View(lease);
        }
    }
    internal object Renew(ControlRequest request)
    {
        lock(gate){var current=ValidateLease(request);CheckDesktop();current.Expires=DateTimeOffset.UtcNow.AddSeconds(5);current.Deadline=Environment.TickCount64+5000;return View(current);}
    }
    internal object End(ControlRequest request)
    {
        lock(gate){ValidateLease(request);Release();return new{released=true};}
    }
    internal object Input(ControlRequest request)
    {
        lock(gate)
        {
            var current=ValidateLease(request);CheckDesktop();
            if(request.Sequence<=current.Sequence || request.Sequence>9_007_199_254_740_991)throw new ControlFailure(409,"Input sequence was already used or is invalid. Never replay input.");
            // Consume even a rejected packet: retrying an uncertain input must never duplicate it.
            current.Sequence=request.Sequence;
            long now=Environment.TickCount64;if(now-rateWindow>=1000){rateWindow=now;rateCount=0;}if(++rateCount>120)throw new ControlFailure(429,"Input rate exceeded. Coalesce pointer movement.");
            var inventory=DesktopCapture.Inventory(hostId);if(inventory.Revision!=current.Revision){Release();throw new ControlFailure(409,"Monitor layout changed before input.");}var monitor=inventory.Monitors.Single(m=>m.Id==current.MonitorId);
            if(request.Type is "pointerMove" or "pointerDown" or "pointerUp")
            {
                if(request.U is not double u || request.V is not double v || !double.IsFinite(u)||!double.IsFinite(v)||u<0||u>1||v<0||v>1)throw new ControlFailure(400,"Pointer must be normalized inside the selected monitor.");
                int x=monitor.Bounds.X+(int)Math.Round(u*(monitor.Bounds.Width-1)),y=monitor.Bounds.Y+(int)Math.Round(v*(monitor.Bounds.Height-1));
                uint flags=0;
                if(request.Type!="pointerMove")
                {
                    flags=(request.Button,request.Type) switch{("left","pointerDown")=>0x0002,("left","pointerUp")=>0x0004,("right","pointerDown")=>0x0008,("right","pointerUp")=>0x0010,("middle","pointerDown")=>0x0020,("middle","pointerUp")=>0x0040,_=>throw new ControlFailure(400,"Choose left, right or middle pointer button.")};
                    if(request.Type=="pointerDown" && current.Buttons.Contains(request.Button!))throw new ControlFailure(409,"Pointer button is already held.");
                    if(request.Type=="pointerUp" && !current.Buttons.Contains(request.Button!))throw new ControlFailure(409,"Pointer button was not held by this lease.");
                }
                CheckTestTarget(x,y);
                var monitors=inventory.Monitors;int left=monitors.Min(m=>m.Bounds.X),top=monitors.Min(m=>m.Bounds.Y),right=monitors.Max(m=>m.Bounds.X+m.Bounds.Width),bottom=monitors.Max(m=>m.Bounds.Y+m.Bounds.Height);
                Send(Mouse((int)Math.Round((x-left)*65535.0/Math.Max(1,right-left-1)),(int)Math.Round((y-top)*65535.0/Math.Max(1,bottom-top-1)),0x8000|0x4000|0x0001|flags));
                if(request.Type=="pointerDown"){current.Buttons.Add(request.Button!);inputWindow=GetForegroundWindow();}else if(request.Type=="pointerUp")current.Buttons.Remove(request.Button!);
            }
            else if(request.Type is "keyDown" or "keyUp")
            {
                if(request.Key is not int key || !ValidKey(key))throw new ControlFailure(400,"Unsupported virtual key.");
                CheckKeyboardTarget(monitor.Bounds);
                bool down=request.Type=="keyDown";
                if(down && current.Keys.Contains(key))throw new ControlFailure(409,"Key is already held.");
                if(!down && !current.Keys.Contains(key))throw new ControlFailure(409,"Key was not held by this lease.");
                Send(Keyboard(key,!down));if(down){current.Keys.Add(key);inputWindow=GetForegroundWindow();}else current.Keys.Remove(key);
            }
            else throw new ControlFailure(400,"Unsupported input type.");
            return new{accepted=true,sequence=current.Sequence};
        }
    }
    private (string Revision,DesktopMonitor[] Monitors) ValidateScope(ControlRequest request)
    {
        if(request.HostId!=hostId)throw new ControlFailure(403,"Input belongs to a different host.");
        var inventory=DesktopCapture.Inventory(hostId);
        if(request.LayoutRevision!=inventory.Revision){Release();throw new ControlFailure(409,"Monitor layout changed. Acquire a new control lease.");}
        if(!inventory.Monitors.Any(m=>m.Id==request.MonitorId))throw new ControlFailure(404,"Selected monitor is unavailable.");
        return inventory;
    }
    private Lease ValidateLease(ControlRequest request)
    {
        Expire();ValidateScope(request);
        if(!allowed || lease is null || request.LeaseId!=lease.Id)throw new ControlFailure(403,"Control lease is missing, expired or revoked.");
        if(request.MonitorId!=lease.MonitorId || request.LayoutRevision!=lease.Revision)throw new ControlFailure(409,"Release control before switching monitors.");
        return lease;
    }
    private void Expire()
    {
        if(lease is null)return;
        try{if(Environment.TickCount64>=lease.Deadline || ((lease.Keys.Count>0 || lease.Buttons.Count>0) && inputWindow!=GetForegroundWindow()) || DesktopCapture.Inventory(hostId).Revision!=lease.Revision)Release();}
        catch{Release();}
    }
    private void CheckDesktop()
    {
        var desktop=OpenInputDesktop(0,false,0x0100);if(desktop==IntPtr.Zero){Release();throw new ControlFailure(423,"Interactive desktop is unavailable.");}CloseDesktop(desktop);
    }
    private void CheckTestTarget(int x,int y)
    {
        if(testWindow==IntPtr.Zero)return;
        if(GetForegroundWindow()!=testWindow || !GetWindowRect(testWindow,out var rect) || x<rect.Left||x>=rect.Right||y<rect.Top||y>=rect.Bottom)throw new ControlFailure(403,"Test input must stay inside the foreground test window.");
    }
    private void CheckKeyboardTarget(DesktopBounds monitor)
    {
        IntPtr window=GetForegroundWindow();
        if(window==IntPtr.Zero || (testWindow!=IntPtr.Zero && window!=testWindow) || !GetWindowRect(window,out var rect))throw new ControlFailure(403,"No permitted foreground keyboard target.");
        int x=rect.Left+(rect.Right-rect.Left)/2,y=rect.Top+(rect.Bottom-rect.Top)/2;
        if(x<monitor.X || x>=monitor.X+monitor.Width || y<monitor.Y || y>=monitor.Y+monitor.Height)throw new ControlFailure(403,"Keyboard focus moved outside the selected monitor.");
    }
    private void Release()
    {
        var previous=lease;lease=null;if(previous is null)return;
        // Release only keys/buttons held by this lease; never replay movements or key-down events.
        foreach(int key in previous.Keys)TrySend(Keyboard(key,true));
        foreach(string button in previous.Buttons)TrySend(Mouse(0,0,button switch{"left"=>0x0004u,"right"=>0x0010u,_=>0x0040u}));
    }
    private static object View(Lease current)=>new{leaseId=current.Id,expiresAt=current.Expires,heartbeatMilliseconds=1500,leaseMilliseconds=5000};
    private static bool ValidKey(int key)=>key is 8 or 9 or 13 or 16 or 17 or 18 or 27 or 32 or 33 or 34 or 35 or 36 or 37 or 38 or 39 or 40 or 45 or 46 or >=48 and <=57 or >=65 and <=90 or >=96 and <=111 or >=112 and <=123 or >=186 and <=192 or >=219 and <=222;
    private static NativeInput Mouse(int x,int y,uint flags)=>new(){Type=0,Data=new InputUnion{Mouse=new(){X=x,Y=y,Flags=flags}}};
    private static NativeInput Keyboard(int key,bool up)=>new(){Type=1,Data=new InputUnion{Keyboard=new(){Key=(ushort)key,Flags=(up?2u:0u)|(key is 33 or 34 or 35 or 36 or 37 or 38 or 39 or 40 or 45 or 46?1u:0u)}}};
    private static void Send(NativeInput input){if(SendInput(1,[input],Marshal.SizeOf<NativeInput>())!=1)throw new ControlFailure(423,"Windows rejected input; elevated and secure windows are unsupported.");}
    private static void TrySend(NativeInput input){try{Send(input);}catch{/* Revoke even when Windows refuses release on a secure desktop. */}}
    public void Dispose(){timer.Dispose();lock(gate){allowed=false;Release();}}
    [StructLayout(LayoutKind.Sequential)]private struct NativeInput{public uint Type;public InputUnion Data;}
    [StructLayout(LayoutKind.Explicit)]private struct InputUnion{[FieldOffset(0)]public MouseInput Mouse;[FieldOffset(0)]public KeyboardInput Keyboard;}
    [StructLayout(LayoutKind.Sequential)]private struct MouseInput{public int X,Y;public uint Data,Flags,Time;public UIntPtr Extra;}
    [StructLayout(LayoutKind.Sequential)]private struct KeyboardInput{public ushort Key,Scan;public uint Flags,Time;public UIntPtr Extra;}
    [StructLayout(LayoutKind.Sequential)]private struct Rect{public int Left,Top,Right,Bottom;}
    [DllImport("user32.dll",SetLastError=true)]private static extern uint SendInput(uint count,NativeInput[] input,int size);
    [DllImport("user32.dll")]private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]private static extern bool GetWindowRect(IntPtr window,out Rect rect);
    [DllImport("user32.dll")]private static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
    [DllImport("user32.dll")]private static extern bool CloseDesktop(IntPtr desktop);
}
