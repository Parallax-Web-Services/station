using System.IO;
using System.Net;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;
using System.Windows.Media.Imaging;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using WpfApplication=System.Windows.Application;

namespace Parallax.Station.DesktopViewHost;
internal static class Program
{
    private sealed class Configuration { public Configuration(){} public string HostId {get;set;}=Guid.NewGuid().ToString("N");public int Port {get;set;}=8760; }
    private static readonly JsonSerializerOptions Json=new(){PropertyNamingPolicy=JsonNamingPolicy.CamelCase,PropertyNameCaseInsensitive=true};
    [STAThread]private static void Main(string[] args)
    {
        bool testMode=args.Contains("--control-test");
        var desktop=new WpfApplication { ShutdownMode=ShutdownMode.OnMainWindowClose };
        desktop.Startup+=async(_,_)=>
        {
            try
            {
                string directory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Parallax","Station",testMode?"DesktopControlTest":"DesktopView");Directory.CreateDirectory(directory);
                using(var owner=WindowsIdentity.GetCurrent())
                {
                    var access=new DirectorySecurity();access.SetAccessRuleProtection(true,false);
                    access.AddAccessRule(new FileSystemAccessRule(owner.User!,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
                    new DirectoryInfo(directory).SetAccessControl(access);
                }
                string configPath=Path.Combine(directory,"host.json");
                var config=File.Exists(configPath)?JsonSerializer.Deserialize<Configuration>(File.ReadAllText(configPath),Json)??new():new();
                if(!Guid.TryParseExact(config.HostId,"N",out _) || config.Port is <1024 or >65535)throw new InvalidOperationException("Invalid desktop view host configuration.");
                if(testMode)config.Port=8762;
                File.WriteAllText(configPath,JsonSerializer.Serialize(config,Json));
                string token=PrivateCredential.GetOrCreate(config.HostId);
                string pairing=Path.Combine(directory,"pairing.json");
                File.WriteAllText(pairing,JsonSerializer.Serialize(new {origin=$"http://127.0.0.1:{config.Port}",token,hostId=config.HostId,viewOnly=true},Json));
                using(var identity=WindowsIdentity.GetCurrent())
                {
                    var security=new FileSecurity();security.SetAccessRuleProtection(true,false);
                    security.AddAccessRule(new FileSystemAccessRule(identity.User!,FileSystemRights.FullControl,AccessControlType.Allow));
                    new FileInfo(pairing).SetAccessControl(security);
                }
                var panel=new StackPanel {Margin=new Thickness(22)};
                panel.Children.Add(new TextBlock{Text=testMode?"Isolated input acceptance":"Desktop viewing is running",FontSize=20,Margin=new Thickness(0,0,0,12)});
                panel.Children.Add(new TextBlock{Text=$"{Environment.MachineName} · localhost:{config.Port}\nControl is off until explicitly enabled here.\nClosing this window stops the host. No unattended access.",TextWrapping=TextWrapping.Wrap});
                var allow=new CheckBox{Content="Allow paired device to control this desktop",Margin=new Thickness(0,14,0,8)};panel.Children.Add(allow);
                var state=new TextBlock{Text="View only",TextWrapping=TextWrapping.Wrap};panel.Children.Add(state);
                var input=new TextBox{Margin=new Thickness(0,10,0,0),Height=32};
                int clicks=0;var target=new Button{Content="Input test target",Margin=new Thickness(0,8,0,0),Height=32};target.Click+=(_,_)=>clicks++;
                if(testMode){panel.Children.Add(input);panel.Children.Add(target);}
                var stop=new Button{Content="Stop desktop host",Margin=new Thickness(0,18,0,0),Padding=new Thickness(12,8,12,8)};stop.Click+=(_,_)=>desktop.Shutdown();panel.Children.Add(stop);
                var window=new Window{Title=testMode?"PARALLAX STATION — Isolated input test":"PARALLAX STATION — Desktop host",Width=520,Height=testMode?460:340,Content=panel,WindowState=testMode?WindowState.Normal:WindowState.Minimized,Icon=new BitmapImage(new Uri("pack://application:,,,/Assets/Parallax.png"))};
                desktop.MainWindow=window;
                IntPtr handle=new WindowInteropHelper(window).EnsureHandle();
                var control=new DesktopControl(config.HostId,testMode?handle:IntPtr.Zero);
                allow.Checked+=(_,_)=>control.Allowed=true;allow.Unchecked+=(_,_)=>control.Allowed=false;
                var statusTimer=new DispatcherTimer{Interval=TimeSpan.FromMilliseconds(250)};statusTimer.Tick+=(_,_)=>{state.Text=(control.Allowed?"Control enabled · ":"View only · ")+control.Status;};statusTimer.Start();
                if(testMode)allow.IsChecked=true;
                var builder=WebApplication.CreateBuilder(new WebApplicationOptions{Args=[],ContentRootPath=AppContext.BaseDirectory,EnvironmentName="Production"});
                builder.Logging.ClearProviders();builder.WebHost.ConfigureKestrel(options=>{options.Limits.MaxRequestBodySize=16384;options.ListenLocalhost(config.Port);});
                var web=builder.Build();var capture=new SemaphoreSlim(1,1);byte[] expected=SHA256.HashData(Encoding.UTF8.GetBytes(token));
                web.Use(async(context,next)=>
                {
                    context.Response.Headers.CacheControl="no-store";context.Response.Headers["X-Content-Type-Options"]="nosniff";
                    string? origin=context.Request.Headers.Origin;
                    if(!string.IsNullOrEmpty(origin))
                    {
                        if(origin is not ("capacitor://localhost" or "http://localhost" or "https://localhost")){context.Response.StatusCode=403;return;}
                        context.Response.Headers["Access-Control-Allow-Origin"]=origin;context.Response.Headers.Vary="Origin";
                    }
                    if(context.Request.Method=="OPTIONS")
                    {context.Response.Headers["Access-Control-Allow-Headers"]="Authorization, Content-Type";context.Response.Headers["Access-Control-Allow-Methods"]="GET, POST, OPTIONS";context.Response.StatusCode=204;return;}
                    bool controlPost=context.Request.Method=="POST" && context.Request.Path.ToString() is "/v1/control/lease" or "/v1/control/renew" or "/v1/control/release" or "/v1/control/input";
                    if(context.Request.Method!="GET" && !controlPost){context.Response.StatusCode=405;return;}
                    if(controlPost && context.Request.ContentLength is >16384){context.Response.StatusCode=413;return;}
                    if(context.Request.Path!="/health")
                    {
                        string authorization=context.Request.Headers.Authorization.ToString();
                        if(!authorization.StartsWith("Bearer ",StringComparison.Ordinal) || !CryptographicOperations.FixedTimeEquals(expected,SHA256.HashData(Encoding.UTF8.GetBytes(authorization[7..]))))
                        {context.Response.StatusCode=401;return;}
                    }
                    await next(context);
                });
                web.MapGet("/health",()=>new {name="PARALLAX STATION desktop host prototype",version=2,viewOnly=true});
                foreach(string action in new[]{"lease","renew","release","input"})
                {
                    web.MapPost("/v1/control/"+action,async Task<IResult>(HttpContext context)=>
                    {
                        try
                        {
                            var request=await context.Request.ReadFromJsonAsync<ControlRequest>(cancellationToken:context.RequestAborted);
                            if(request is null)return Results.BadRequest(new{message="A scoped control request is required."});
                            object output=action switch{"lease"=>control.Acquire(request),"renew"=>control.Renew(request),"release"=>control.End(request),_=>control.Input(request)};
                            return Results.Json(output);
                        }
                        catch(ControlFailure error){return Results.Json(new{message=error.Message},statusCode:error.Status);}
                        catch(System.Text.Json.JsonException){return Results.BadRequest(new{message="Invalid control request."});}
                    });
                }
                if(testMode)web.MapGet("/v1/control-test",async()=>await desktop.Dispatcher.InvokeAsync(()=>
                {
                    object Point(FrameworkElement element){var p=element.PointToScreen(new System.Windows.Point(element.ActualWidth/2,element.ActualHeight/2));return new{x=p.X,y=p.Y};}
                    return new{text=input.Text,clicks,input=Point(input),target=Point(target),allow=Point(allow),controlAllowed=control.Allowed};
                }));
                web.MapGet("/v1/desktop",()=>
                {
                    var inventory=DesktopCapture.Inventory(config.HostId);
                    return new {hostId=config.HostId,name=Environment.MachineName,layoutRevision=inventory.Revision,viewOnly=true,capabilities=new {view=true,control=control.Allowed,clipboard=false,fileTransfer=false,secureDesktop=false,unattended=false},monitors=inventory.Monitors};
                });
                web.MapGet("/v1/frame",async Task<IResult>(HttpContext context)=>
                {
                    string monitorId=context.Request.Query["monitorId"].ToString(),revision=context.Request.Query["revision"].ToString();
                    int width=960;if(context.Request.Query.TryGetValue("maxWidth",out var value) && (!int.TryParse(value,out width)||width is <320 or >1920))return Results.BadRequest(new {message="Choose a frame width from 320 to 1920."});
                    if(!await capture.WaitAsync(50,context.RequestAborted))return Results.Json(new {message="Capture is busy; request a later frame."},statusCode:429);
                    try
                    {
                        var inventory=DesktopCapture.Inventory(config.HostId);
                        if(revision!=inventory.Revision)return Results.Json(new {message="The monitor layout changed. Refresh the desktop inventory."},statusCode:409);
                        var monitor=inventory.Monitors.FirstOrDefault(m=>m.Id==monitorId);if(monitor is null)return Results.NotFound(new {message="Monitor not found."});
                        var frame=DesktopCapture.Frame(monitor,width);
                        return Results.Json(new {hostId=config.HostId,monitorId,layoutRevision=inventory.Revision,time=DateTimeOffset.UtcNow,width=frame.Width,height=frame.Height,physicalBounds=monitor.Bounds,viewOnly=true,image="data:image/jpeg;base64,"+Convert.ToBase64String(frame.Jpeg)});
                    }
                    catch(Exception error)when(error is InvalidOperationException or System.ComponentModel.Win32Exception)
                    {return Results.Json(new {message="The interactive desktop cannot be viewed in this session."},statusCode:423);}
                    finally{capture.Release();}
                });
                desktop.Exit+=(_,_)=>{statusTimer.Stop();control.Dispose();Task.Run(()=>web.StopAsync(TimeSpan.FromSeconds(2))).GetAwaiter().GetResult();};
                await web.StartAsync();window.Show();if(testMode){window.Activate();input.Focus();}
            }
            catch(Exception error){MessageBox.Show(error.Message,"Desktop viewing could not start");desktop.Shutdown(1);}
        };
        desktop.Run();
    }
}
