using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Parallax.Station.DesktopViewHost;

internal sealed record DesktopBounds(int X,int Y,int Width,int Height);
internal sealed record DesktopMonitor(string Id,string Name,bool Primary,DesktopBounds Bounds,double Scale,bool StableIdentity);
internal static class DesktopCapture
{
    internal static (string Revision,DesktopMonitor[] Monitors) Inventory(string hostId)
    {
        IntPtr previous=SetThreadDpiAwarenessContext(new(-4));
        try
        {
            var monitors=new List<DesktopMonitor>();
            MonitorCallback callback=(IntPtr handle,IntPtr dc,ref NativeRect rectangle,IntPtr state)=>
            {
                var info=new MonitorInfo { Size=Marshal.SizeOf<MonitorInfo>(),Device="" };
                if(!GetMonitorInfo(handle,ref info))throw new Win32Exception(Marshal.GetLastWin32Error());
                var device=new DisplayDevice { Size=Marshal.SizeOf<DisplayDevice>(),Name="",Description="",Id="",Key="" };
                bool identified=EnumDisplayDevices(info.Device,0,ref device,1) && !string.IsNullOrWhiteSpace(device.Id);
                string identity=identified?device.Id:info.Device;
                string id=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(hostId+"|"+identity)))[..24];
                GetScaleFactorForMonitor(handle,out int scale);
                bool hasDpi=GetDpiForMonitor(handle,0,out uint dpiX,out _) == 0 && dpiX is >=96 and <=480;
                var bounds=new DesktopBounds(info.Monitor.Left,info.Monitor.Top,info.Monitor.Right-info.Monitor.Left,info.Monitor.Bottom-info.Monitor.Top);
                monitors.Add(new(id,string.IsNullOrWhiteSpace(device.Description)?info.Device:device.Description,(info.Flags&1)!=0,bounds,hasDpi?dpiX/96.0:scale is >=100 and <=500?scale/100.0:1.0,identified));return true;
            };
            if(!EnumDisplayMonitors(IntPtr.Zero,IntPtr.Zero,callback,IntPtr.Zero))throw new Win32Exception(Marshal.GetLastWin32Error());
            var result=monitors.OrderBy(m=>m.Id).ToArray();
            string geometry=string.Join("|",result.Select(m=>$"{m.Id}:{m.Bounds.X},{m.Bounds.Y},{m.Bounds.Width},{m.Bounds.Height}:{m.Scale}"));
            return(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(geometry)))[..24],result);
        }
        finally { if(previous!=IntPtr.Zero)SetThreadDpiAwarenessContext(previous); }
    }
    internal static (byte[] Jpeg,int Width,int Height) Frame(DesktopMonitor monitor,int maximumWidth)
    {
        var bounds=monitor.Bounds;
        if(bounds.Width<=0 || bounds.Height<=0 || (long)bounds.Width*bounds.Height>20_000_000)throw new InvalidOperationException("This monitor exceeds the prototype capture limit.");
        IntPtr previous=SetThreadDpiAwarenessContext(new(-4)),screen=IntPtr.Zero,memory=IntPtr.Zero,bitmap=IntPtr.Zero,original=IntPtr.Zero;
        try
        {
            IntPtr desktop=OpenInputDesktop(0,false,0x0100);
            if(desktop==IntPtr.Zero)throw new InvalidOperationException("The interactive desktop is unavailable or locked.");
            CloseDesktop(desktop);
            screen=GetDC(IntPtr.Zero);memory=CreateCompatibleDC(screen);bitmap=CreateCompatibleBitmap(screen,bounds.Width,bounds.Height);
            if(screen==IntPtr.Zero || memory==IntPtr.Zero || bitmap==IntPtr.Zero)throw new Win32Exception();
            original=SelectObject(memory,bitmap);
            if(!BitBlt(memory,0,0,bounds.Width,bounds.Height,screen,bounds.X,bounds.Y,0x40CC0020))throw new Win32Exception(Marshal.GetLastWin32Error());
            BitmapSource source=Imaging.CreateBitmapSourceFromHBitmap(bitmap,IntPtr.Zero,Int32Rect.Empty,BitmapSizeOptions.FromEmptyOptions());
            if(source.PixelWidth>maximumWidth)source=new TransformedBitmap(source,new ScaleTransform((double)maximumWidth/source.PixelWidth,(double)maximumWidth/source.PixelWidth));
            source.Freeze();var encoder=new JpegBitmapEncoder { QualityLevel=70 };encoder.Frames.Add(BitmapFrame.Create(source));
            using var output=new System.IO.MemoryStream();encoder.Save(output);return(output.ToArray(),source.PixelWidth,source.PixelHeight);
        }
        finally
        {
            if(original!=IntPtr.Zero && memory!=IntPtr.Zero)SelectObject(memory,original);
            if(bitmap!=IntPtr.Zero)DeleteObject(bitmap);
            if(memory!=IntPtr.Zero)DeleteDC(memory);
            if(screen!=IntPtr.Zero)ReleaseDC(IntPtr.Zero,screen);
            if(previous!=IntPtr.Zero)SetThreadDpiAwarenessContext(previous);
        }
    }
    [StructLayout(LayoutKind.Sequential)]private struct NativeRect{public int Left,Top,Right,Bottom;}
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]private struct MonitorInfo{public int Size;public NativeRect Monitor,Work;public uint Flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string Device;}
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]private struct DisplayDevice{public int Size;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string Name;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string Description;public uint Flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string Id;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string Key;}
    private delegate bool MonitorCallback(IntPtr monitor,IntPtr dc,ref NativeRect rectangle,IntPtr state);
    [DllImport("user32.dll")]private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll",SetLastError=true)]private static extern bool EnumDisplayMonitors(IntPtr dc,IntPtr clip,MonitorCallback callback,IntPtr state);
    [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="GetMonitorInfoW",SetLastError=true)]private static extern bool GetMonitorInfo(IntPtr monitor,ref MonitorInfo info);
    [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="EnumDisplayDevicesW")]private static extern bool EnumDisplayDevices(string device,uint index,ref DisplayDevice display,uint flags);
    [DllImport("shcore.dll")]private static extern int GetDpiForMonitor(IntPtr monitor,int type,out uint x,out uint y);
    [DllImport("shcore.dll")]private static extern int GetScaleFactorForMonitor(IntPtr monitor,out int scale);
    [DllImport("user32.dll",SetLastError=true)]private static extern IntPtr GetDC(IntPtr window);
    [DllImport("user32.dll")]private static extern int ReleaseDC(IntPtr window,IntPtr dc);
    [DllImport("gdi32.dll")]private static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")]private static extern IntPtr CreateCompatibleBitmap(IntPtr dc,int width,int height);
    [DllImport("gdi32.dll")]private static extern IntPtr SelectObject(IntPtr dc,IntPtr value);
    [DllImport("gdi32.dll",SetLastError=true)]private static extern bool BitBlt(IntPtr destination,int x,int y,int width,int height,IntPtr source,int sourceX,int sourceY,uint operation);
    [DllImport("gdi32.dll")]private static extern bool DeleteObject(IntPtr value);
    [DllImport("gdi32.dll")]private static extern bool DeleteDC(IntPtr dc);
    [DllImport("user32.dll",SetLastError=true)]private static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
    [DllImport("user32.dll")]private static extern bool CloseDesktop(IntPtr desktop);
}
