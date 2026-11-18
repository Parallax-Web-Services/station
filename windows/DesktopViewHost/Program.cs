using System.IO;
using System.Net;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
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
        var desktop=new WpfApplication { ShutdownMode=ShutdownMode.OnMainWindowClose };
        desktop.Startup+=async(_,_)=>
        {
            try
            {
                string directory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Parallax","Station","DesktopView");Directory.CreateDirectory(directory);
                using(var owner=WindowsIdentity.GetCurrent())
                {
                    var access=new DirectorySecurity();access.SetAccessRuleProtection(true,false);
                    access.AddAccessRule(new FileSystemAccessRule(owner.User!,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
                    new DirectoryInfo(directory).SetAccessControl(access);
                }
                string configPath=Path.Combine(directory,"host.json");
                var config=File.Exists(configPath)?JsonSerializer.Deserialize<Configuration>(File.ReadAllText(configPath),Json)??new():new();
                if(!Guid.TryParseExact(config.HostId,"N",out _) || config.Port is <1024 or >65535)throw new InvalidOperationException("Invalid desktop view host configuration.");
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
                var builder=WebApplication.CreateBuilder(new WebApplicationOptions{Args=[],ContentRootPath=AppContext.BaseDirectory,EnvironmentName="Production"});
                builder.Logging.ClearProviders();builder.WebHost.ConfigureKestrel(options=>options.ListenLocalhost(config.Port));
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
                    {context.Response.Headers["Access-Control-Allow-Headers"]="Authorization";context.Response.Headers["Access-Control-Allow-Methods"]="GET, OPTIONS";context.Response.StatusCode=204;return;}
                    if(context.Request.Method!="GET"){context.Response.StatusCode=405;return;}
                    if(context.Request.Path!="/health")
                    {
                        string authorization=context.Request.Headers.Authorization.ToString();
                        if(!authorization.StartsWith("Bearer ",StringComparison.Ordinal) || !CryptographicOperations.FixedTimeEquals(expected,SHA256.HashData(Encoding.UTF8.GetBytes(authorization[7..]))))
                        {context.Response.StatusCode=401;return;}
                    }
                    await next(context);
                });
                web.MapGet("/health",()=>new {name="PARALLAX STATION desktop view prototype",version=1,viewOnly=true});
                web.MapGet("/v1/desktop",()=>
                {
                    var inventory=DesktopCapture.Inventory(config.HostId);
                    return new {hostId=config.HostId,name=Environment.MachineName,layoutRevision=inventory.Revision,viewOnly=true,capabilities=new {view=true,control=false,clipboard=false,fileTransfer=false,secureDesktop=false,unattended=false},monitors=inventory.Monitors};
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
                var panel=new StackPanel {Margin=new Thickness(22)};
                panel.Children.Add(new TextBlock{Text="Desktop viewing is running",FontSize=20,Margin=new Thickness(0,0,0,12)});
                panel.Children.Add(new TextBlock{Text=$"View only · {Environment.MachineName} · localhost:{config.Port}\nNo keyboard, mouse, clipboard or file access.\nClosing this window stops viewing.",TextWrapping=TextWrapping.Wrap});
                var stop=new Button{Content="Stop desktop viewing",Margin=new Thickness(0,18,0,0),Padding=new Thickness(12,8,12,8)};stop.Click+=(_,_)=>desktop.Shutdown();panel.Children.Add(stop);
                var window=new Window{Title="PARALLAX STATION — Desktop view host",Width=460,Height=250,Content=panel,WindowState=WindowState.Minimized,Icon=new BitmapImage(new Uri("pack://application:,,,/Assets/Parallax.png"))};
                desktop.MainWindow=window;desktop.Exit+=(_,_)=>{Task.Run(()=>web.StopAsync(TimeSpan.FromSeconds(2))).GetAwaiter().GetResult();};
                await web.StartAsync();window.Show();
            }
            catch(Exception error){MessageBox.Show(error.Message,"Desktop viewing could not start");desktop.Shutdown(1);}
        };
        desktop.Run();
    }
}
