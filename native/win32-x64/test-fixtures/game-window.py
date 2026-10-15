"""Invisible Win32 fixtures for the PID-scoped snapshot addon; no game is used."""

import ctypes
import json
import os
import sys
from ctypes import wintypes as wt


user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM)


class WNDCLASS(ctypes.Structure):
    _fields_ = [
        ("style", wt.UINT),
        ("lpfnWndProc", WNDPROC),
        ("cbClsExtra", ctypes.c_int),
        ("cbWndExtra", ctypes.c_int),
        ("hInstance", wt.HINSTANCE),
        ("hIcon", wt.HICON),
        ("hCursor", wt.HANDLE),
        ("hbrBackground", wt.HBRUSH),
        ("lpszMenuName", wt.LPCWSTR),
        ("lpszClassName", wt.LPCWSTR),
    ]


user32.DefWindowProcW.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]
user32.DefWindowProcW.restype = ctypes.c_ssize_t
user32.RegisterClassW.argtypes = [ctypes.POINTER(WNDCLASS)]
user32.RegisterClassW.restype = wt.ATOM
user32.UnregisterClassW.argtypes = [wt.LPCWSTR, wt.HINSTANCE]
user32.UnregisterClassW.restype = wt.BOOL
user32.CreateWindowExW.argtypes = [
    wt.DWORD, wt.LPCWSTR, wt.LPCWSTR, wt.DWORD, ctypes.c_int, ctypes.c_int,
    ctypes.c_int, ctypes.c_int, wt.HWND, wt.HMENU, wt.HINSTANCE, ctypes.c_void_p,
]
user32.CreateWindowExW.restype = wt.HWND
user32.DestroyWindow.argtypes = [wt.HWND]
user32.DestroyWindow.restype = wt.BOOL
user32.IsWindow.argtypes = [wt.HWND]
user32.IsWindow.restype = wt.BOOL
user32.IsWindowVisible.argtypes = [wt.HWND]
user32.IsWindowVisible.restype = wt.BOOL
user32.IsIconic.argtypes = [wt.HWND]
user32.IsIconic.restype = wt.BOOL
user32.GetClientRect.argtypes = [wt.HWND, ctypes.POINTER(wt.RECT)]
user32.GetClientRect.restype = wt.BOOL
user32.ClientToScreen.argtypes = [wt.HWND, ctypes.POINTER(wt.POINT)]
user32.ClientToScreen.restype = wt.BOOL
user32.AdjustWindowRectEx.argtypes = [ctypes.POINTER(wt.RECT), wt.DWORD, wt.BOOL, wt.DWORD]
user32.AdjustWindowRectEx.restype = wt.BOOL
user32.SetThreadDpiAwarenessContext.argtypes = [ctypes.c_void_p]
user32.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
kernel32.GetModuleHandleW.argtypes = [wt.LPCWSTR]
kernel32.GetModuleHandleW.restype = wt.HMODULE

WS_OVERLAPPEDWINDOW = 0x00CF0000
WS_POPUP = 0x80000000
WS_CHILD = 0x40000000
WS_MINIMIZE = 0x20000000
WS_EX_TOOLWINDOW = 0x00000080
WS_EX_NOACTIVATE = 0x08000000
instance = kernel32.GetModuleHandleW(None)
class_name = "AkariGameWindowSnapshotFixture"
windows = {}


@WNDPROC
def window_proc(hwnd, message, wparam, lparam):
    return user32.DefWindowProcW(hwnd, message, wparam, lparam)


def create(label, x, y, width, height, style=WS_OVERLAPPEDWINDOW, extended_style=0, parent=0):
    rect = wt.RECT(0, 0, width, height)
    if not user32.AdjustWindowRectEx(ctypes.byref(rect), style, False, extended_style):
        raise ctypes.WinError(ctypes.get_last_error())
    hwnd = user32.CreateWindowExW(
        extended_style, class_name, label, style, x, y,
        rect.right - rect.left, rect.bottom - rect.top, parent, None, instance, None,
    )
    if not hwnd:
        raise ctypes.WinError(ctypes.get_last_error())
    windows[label] = hwnd
    if user32.IsWindowVisible(hwnd):
        raise RuntimeError("Fixture unexpectedly became visible")
    return hwnd


def destroy(label):
    hwnd = windows.pop(label, None)
    if hwnd and user32.IsWindow(hwnd) and not user32.DestroyWindow(hwnd):
        raise ctypes.WinError(ctypes.get_last_error())


def state(label):
    hwnd = windows.get(label)
    expected = None
    if hwnd and user32.IsWindow(hwnd):
        rect = wt.RECT()
        if not user32.GetClientRect(hwnd, ctypes.byref(rect)):
            raise ctypes.WinError(ctypes.get_last_error())
        top_left = wt.POINT(rect.left, rect.top)
        bottom_right = wt.POINT(rect.right, rect.bottom)
        if not user32.ClientToScreen(hwnd, ctypes.byref(top_left)):
            raise ctypes.WinError(ctypes.get_last_error())
        if not user32.ClientToScreen(hwnd, ctypes.byref(bottom_right)):
            raise ctypes.WinError(ctypes.get_last_error())
        expected = {
            "windowHandle": str(hwnd),
            "bounds": {
                "x": top_left.x, "y": top_left.y,
                "width": bottom_right.x - top_left.x,
                "height": bottom_right.y - top_left.y,
            },
            "isVisible": bool(user32.IsWindowVisible(hwnd)),
            "isMinimized": bool(user32.IsIconic(hwnd)),
        }
    visible = [name for name, handle in windows.items()
               if user32.IsWindow(handle) and user32.IsWindowVisible(handle)]
    if visible:
        raise RuntimeError("Only invisible fixture windows are allowed")
    return {"pid": os.getpid(), "expected": expected, "visibleWindowCount": len(visible)}


previous_context = user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))
if not previous_context:
    raise ctypes.WinError(ctypes.get_last_error())
window_class = WNDCLASS()
window_class.lpfnWndProc = window_proc
window_class.hInstance = instance
window_class.lpszClassName = class_name
if not user32.RegisterClassW(ctypes.byref(window_class)):
    raise ctypes.WinError(ctypes.get_last_error())

try:
    main = create("main", -1800, 87, 1280, 720)
    create("small-auxiliary", -1700, 100, 400, 300)
    create("tool", 0, 0, 3200, 1900, WS_POPUP, WS_EX_TOOLWINDOW)
    create("owned", 0, 0, 3500, 2000, WS_POPUP, parent=main)
    create("no-activate", 0, 0, 3600, 2100, WS_POPUP, WS_EX_NOACTIVATE)
    create("child", 0, 0, 3700, 2200, WS_CHILD, parent=main)
    create("zero-size", 0, 0, 0, 0, WS_POPUP)
    print(json.dumps(state("main")), flush=True)
    for line in sys.stdin:
        command = json.loads(line)["command"]
        if command == "tie":
            create("tie", -1500, 100, 1280, 720)
            result = state("main")
        elif command == "untie":
            destroy("tie")
            result = state("main")
        elif command == "recreate":
            destroy("main")
            create("main", -1500, 127, 1024, 600)
            result = state("main")
        elif command == "minimized":
            destroy("main")
            destroy("small-auxiliary")
            create("minimized", -1500, 127, 1024, 600, WS_OVERLAPPEDWINDOW | WS_MINIMIZE)
            result = state("minimized")
        elif command == "remove-eligible":
            destroy("minimized")
            result = state("minimized")
        elif command == "quit":
            break
        else:
            raise ValueError("Unknown fixture command")
        print(json.dumps(result), flush=True)
finally:
    for label in list(windows):
        destroy(label)
    user32.UnregisterClassW(class_name, instance)
    user32.SetThreadDpiAwarenessContext(previous_context)
