
from pathlib import Path
import os
import shutil
import subprocess
import sys


if getattr(sys, "frozen", False):
    here = Path(sys.executable).resolve().parent  
else:
    here = Path(__file__).resolve().parent   
source = here / "Systems"                       
source_exe = source / "Systems.exe"

if not source_exe.exists():
    raise FileNotFoundError(
        f"Can't find Systems.exe at {source_exe}. "
        f"Make sure the 'Systems' folder is next to installer.py."
    )


dest = Path(os.environ["LOCALAPPDATA"]) / "main"   # C:\Users\<you>\AppData\Local\main
dest_exe = dest / "Systems.exe"


if dest.exists():
    shutil.rmtree(dest)
shutil.copytree(source, dest)
# print


startup = (
    Path(os.environ["APPDATA"])
    / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
)
startup.mkdir(parents=True, exist_ok=True)


for name in ("Systems.exe", "Systems.lnk", "Systems.vbs"):
    old = startup / name
    if old.exists():
        old.unlink()
        print(f"Removed stale: {old}")

shortcut = startup / "Systems.lnk"
subprocess.run([
    "powershell", "-NoProfile", "-Command",
    f'''
    $ws = New-Object -ComObject WScript.Shell
    $shortcut = $ws.CreateShortcut("{shortcut}")
    $shortcut.TargetPath = "{dest_exe}"
    $shortcut.WorkingDirectory = "{dest}"
    $shortcut.Save()
    '''
])
print(f"Created shortcut: {shortcut}")
print("Done. Sign out and back in to test auto-launch.")
