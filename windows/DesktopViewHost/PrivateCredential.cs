using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
namespace Parallax.Station.DesktopViewHost;
internal static class PrivateCredential
{
    internal static string GetOrCreate(string hostId)
    {
        string target="Parallax.Station/DesktopView/"+hostId;
        if(CredRead(target,1,0,out var pointer))
        {try{var credential=Marshal.PtrToStructure<Credential>(pointer);return Marshal.PtrToStringUni(credential.Blob,(int)credential.BlobSize/2)!;}finally{CredFree(pointer);}}
        if(Marshal.GetLastWin32Error()!=1168)throw new Win32Exception(Marshal.GetLastWin32Error());
        string token=Convert.ToHexString(RandomNumberGenerator.GetBytes(32));byte[] bytes=Encoding.Unicode.GetBytes(token);
        var value=new Credential { Type=1,TargetName=target,UserName="Station desktop view device",Persist=2,BlobSize=(uint)bytes.Length,Blob=Marshal.AllocHGlobal(bytes.Length) };
        try{Marshal.Copy(bytes,0,value.Blob,bytes.Length);if(!CredWrite(ref value,0))throw new Win32Exception(Marshal.GetLastWin32Error());}
        finally{Marshal.FreeHGlobal(value.Blob);Array.Clear(bytes);}return token;
    }
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]private struct Credential
    {public uint Flags,Type;public string TargetName;public string? Comment;public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;public uint BlobSize;public IntPtr Blob;public uint Persist,AttributeCount;public IntPtr Attributes;public string? TargetAlias;public string UserName;}
    [DllImport("advapi32.dll",EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]private static extern bool CredRead(string target,uint type,uint flags,out IntPtr credential);
    [DllImport("advapi32.dll",EntryPoint="CredWriteW",CharSet=CharSet.Unicode,SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]private static extern bool CredWrite(ref Credential credential,uint flags);
    [DllImport("advapi32.dll")]private static extern void CredFree(IntPtr credential);
}
