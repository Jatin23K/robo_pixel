import time
import ctypes
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading
import os

# Windows API Setup
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
psapi = ctypes.windll.psapi

class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [
        ("cbSize", ctypes.c_uint),
        ("dwTime", ctypes.c_uint)
    ]

# Global state
current_context = {
    "active_window_title": "",
    "active_process_name": "",
    "idle_time_ms": 0
}

def get_idle_time_ms():
    lii = LASTINPUTINFO()
    lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
    if user32.GetLastInputInfo(ctypes.byref(lii)):
        millis = kernel32.GetTickCount() - lii.dwTime
        return millis
    return 0

def get_foreground_process_info():
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return "", ""
    
    # Get Title
    length = user32.GetWindowTextLengthW(hwnd)
    buff = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buff, length + 1)
    title = buff.value
    
    # Get Process Name
    pid = ctypes.c_ulong()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    
    process_name = ""
    PROCESS_QUERY_INFORMATION = 0x0400
    PROCESS_VM_READ = 0x0010
    
    h_process = kernel32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid)
    if h_process:
        name_buff = ctypes.create_unicode_buffer(1024)
        if psapi.GetModuleFileNameExW(h_process, 0, name_buff, 1024) > 0:
            process_name = os.path.basename(name_buff.value)
        kernel32.CloseHandle(h_process)
        
    return title, process_name

def tracker_loop():
    while True:
        try:
            title, process = get_foreground_process_info()
            idle_ms = get_idle_time_ms()
            
            current_context["active_window_title"] = title
            current_context["active_process_name"] = process
            current_context["idle_time_ms"] = idle_ms
            
        except Exception as e:
            pass
            
        time.sleep(1)

class ContextHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(current_context).encode('utf-8'))

    def log_message(self, format, *args):
        pass # Silence logs

def run_server():
    server = HTTPServer(('127.0.0.1', 8080), ContextHandler)
    print("Python Context Tracker running on port 8080...")
    server.serve_forever()

if __name__ == '__main__':
    t = threading.Thread(target=tracker_loop, daemon=True)
    t.start()
    run_server()
