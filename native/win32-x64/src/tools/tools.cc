#include "tools.h"
#include <cmath>
#include <cstdint>
#include <unordered_set>

namespace {
struct LeagueClientWindowSearch {
  DWORD processId;
  std::unordered_set<DWORD> relatedProcessIds;
  HWND hwnd;
  int priority;
};

BOOL CALLBACK FindLeagueClientWindowByProcessId(HWND hwnd, LPARAM parameter) {
  auto* search = reinterpret_cast<LeagueClientWindowSearch*>(parameter);
  DWORD processId = 0;
  if (!GetWindowThreadProcessId(hwnd, &processId) ||
      search->relatedProcessIds.find(processId) == search->relatedProcessIds.end()) {
    return TRUE;
  }

  wchar_t className[256] = {};
  if (!GetClassNameW(hwnd, className, 256) || lstrcmpW(className, APPLICATION_CLASS_NAME) != 0) {
    return TRUE;
  }

  // A recreated visible window must win over a stale hidden/minimized window of the same PID.
  int priority = IsWindowVisible(hwnd) ? (IsIconic(hwnd) ? 1 : 2) : 0;
  HWND foregroundWindow = GetForegroundWindow();
  if (foregroundWindow != nullptr && GetAncestor(foregroundWindow, GA_ROOT) == hwnd) {
    priority = 3;
  }
  if (priority > search->priority) {
    search->hwnd = hwnd;
    search->priority = priority;
  }
  return priority == 3 ? FALSE : TRUE;
}

struct GameClientWindowSearch {
  DWORD processId;
  HWND foregroundRoot;
  HWND hwnd;
  int priority;
  int64_t clientArea;
  bool ambiguous;
};

BOOL CALLBACK FindGameClientWindowByProcessId(HWND hwnd, LPARAM parameter) {
  auto* search = reinterpret_cast<GameClientWindowSearch*>(parameter);
  DWORD processId = 0;
  // Only inspect window properties after matching the caller's known game PID.
  if (!GetWindowThreadProcessId(hwnd, &processId) || processId != search->processId) {
    return TRUE;
  }

  LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
  LONG_PTR extendedStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
  if (!IsWindow(hwnd) || GetAncestor(hwnd, GA_ROOT) != hwnd ||
      GetWindow(hwnd, GW_OWNER) != nullptr || (style & WS_CHILD) ||
      (extendedStyle & (WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE))) {
    return TRUE;
  }

  RECT clientRect = {};
  if (!GetClientRect(hwnd, &clientRect)) return TRUE;
  LONG width = clientRect.right - clientRect.left;
  LONG height = clientRect.bottom - clientRect.top;
  bool minimized = IsIconic(hwnd) != FALSE;
  if (width < 0 || height < 0 || (!minimized && (width == 0 || height == 0))) {
    return TRUE;
  }

  bool visible = IsWindowVisible(hwnd) != FALSE;
  int priority = visible ? (minimized ? 1 : 2) : 0;
  if (visible && !minimized && search->foregroundRoot == hwnd) priority = 3;
  int64_t clientArea = static_cast<int64_t>(width) * height;
  if (priority > search->priority ||
      (priority == search->priority && clientArea > search->clientArea)) {
    search->hwnd = hwnd;
    search->priority = priority;
    search->clientArea = clientArea;
    search->ambiguous = false;
  } else if (priority == search->priority && clientArea == search->clientArea) {
    // Do not guess between indistinguishable top-level candidates.
    search->ambiguous = true;
  }
  return TRUE;
}
} // namespace

HANDLE OpenProcessFromPid(DWORD pid, DWORD access) {
  return OpenProcess(access, FALSE, pid);
}

int GetProcessCommandLine1(DWORD pid, std::wstring* commandLine) {
  HANDLE hProcess = NULL;
  ULONG bufLen = 0;
  NTSTATUS status;
  char* buffer = NULL;
  PUNICODE_STRING tmp = NULL;
  int ProcessCommandLineInformation = 60;

  hProcess = OpenProcessFromPid(pid, PROCESS_QUERY_LIMITED_INFORMATION);
  if (hProcess == NULL)
    goto error;

  status = NtQueryInformationProcess(hProcess, (PROCESSINFOCLASS)ProcessCommandLineInformation, NULL, 0, &bufLen);
  if (status != STATUS_BUFFER_OVERFLOW && status != STATUS_BUFFER_TOO_SMALL && status != STATUS_INFO_LENGTH_MISMATCH)
    goto error;

  buffer = (char*)calloc(bufLen, 1);
  if (buffer == NULL) {
    fprintf(stderr, "Memory allocation failed\n");
    goto error;
  }

  status = NtQueryInformationProcess(hProcess, (PROCESSINFOCLASS)ProcessCommandLineInformation, buffer, bufLen, &bufLen);
  if (!NT_SUCCESS(status))
    goto error;

  tmp = (PUNICODE_STRING)buffer;
  if (tmp->Buffer == NULL || tmp->Length == 0) {
    goto error;
  }

  commandLine->assign(tmp->Buffer, tmp->Length / sizeof(WCHAR));

  free(buffer);
  CloseHandle(hProcess);
  return 0;

error:
  if (buffer != NULL)
    free(buffer);
  if (hProcess != NULL)
    CloseHandle(hProcess);
  return -1;
}

// The "1" suffix leaves room for a future PEB-based implementation.
Napi::String GetCommandLine1(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
    return Napi::String::New(env, "");
  }

  DWORD pid = info[0].As<Napi::Number>().Uint32Value();
  std::wstring cmdline;

  int result = GetProcessCommandLine1(pid, &cmdline);
  if (result == 0) {
    std::u16string cmd(reinterpret_cast<const char16_t*>(cmdline.data()), cmdline.size());
    return Napi::String::New(env, cmd);
  } else {
    return Napi::String::New(env, "Failed to retrieve command line.");
  }
}

Napi::Array GetPidsByName(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
    return Napi::Array::New(env);
  }

  std::string processName = info[0].As<Napi::String>().Utf8Value();
  std::vector<DWORD> pids;
  HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);

  if (hSnapshot == INVALID_HANDLE_VALUE) {
    return Napi::Array::New(env);
  }

  PROCESSENTRY32 pe32;
  pe32.dwSize = sizeof(PROCESSENTRY32);

  if (Process32First(hSnapshot, &pe32)) {
    do {
      if (strcmp((const char*)pe32.szExeFile, processName.c_str()) == 0) {
        pids.push_back(pe32.th32ProcessID);
      }
    } while (Process32Next(hSnapshot, &pe32));
  }

  CloseHandle(hSnapshot);

  Napi::Array result = Napi::Array::New(env, pids.size());
  for (size_t i = 0; i < pids.size(); i++) {
    result.Set(i, Napi::Number::New(env, pids[i]));
  }

  return result;
}

Napi::Value FixWindowMethodA(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "Expected zoom scale and configuration object").ThrowAsJavaScriptException();
    return env.Null();
  }

  double clientZoomScale = info[0].As<Napi::Number>().DoubleValue();
  Napi::Object config = info[1].As<Napi::Object>();

  if (clientZoomScale == -1) {
    Napi::Error::New(env, "Invalid original zoom of LeagueClientUx").ThrowAsJavaScriptException();
    return env.Null();
  }

  int baseWidth = config.Has("baseWidth") ? config.Get("baseWidth").As<Napi::Number>().Int32Value() : 1280;
  int baseHeight = config.Has("baseHeight") ? config.Get("baseHeight").As<Napi::Number>().Int32Value() : 720;

  HWND leagueClientWindowHWnd = FindWindowW(APPLICATION_CLASS_NAME, APPLICATION_NAME);
  HWND leagueClientWindowCefHWnd = FindWindowExW(leagueClientWindowHWnd, nullptr, CEF_WINDOW_NAME, nullptr);

  if (leagueClientWindowHWnd == nullptr || leagueClientWindowCefHWnd == nullptr) {
    Napi::Error::New(env, "Can't find LeagueClient window").ThrowAsJavaScriptException();
    return env.Null();
  }

  int screenWidth = GetSystemMetrics(SM_CXSCREEN);
  int screenHeight = GetSystemMetrics(SM_CYSCREEN);

  int width = static_cast<int>(baseWidth * clientZoomScale);
  int height = static_cast<int>(baseHeight * clientZoomScale);

  SetWindowPos(leagueClientWindowHWnd, HWND_TOP, (screenWidth - width) / 2, (screenHeight - height) / 2, width, height, SWP_NOZORDER);
  SetWindowPos(leagueClientWindowCefHWnd, HWND_TOP, 0, 0, width, height, SWP_NOZORDER);

  return Napi::Boolean::New(env, true);
}

Napi::Value GetLeagueClientWindowPlacementInfo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  HWND hwnd = FindWindowW(APPLICATION_CLASS_NAME, APPLICATION_NAME);
  if (hwnd == NULL) {
    return env.Null();
  }

  WINDOWPLACEMENT wp;
  wp.length = sizeof(WINDOWPLACEMENT);
  if (!GetWindowPlacement(hwnd, &wp)) {
    return env.Null();
  }

  UINT dpi = GetDpiForWindow(hwnd);
  float scaleFactor = static_cast<float>(dpi) / 96.0f;

  int left = static_cast<int>(wp.rcNormalPosition.left / scaleFactor);
  int top = static_cast<int>(wp.rcNormalPosition.top / scaleFactor);
  int right = static_cast<int>(wp.rcNormalPosition.right / scaleFactor);
  int bottom = static_cast<int>(wp.rcNormalPosition.bottom / scaleFactor);
  int width = right - left;
  int height = bottom - top;

  bool isMinimized = IsIconic(hwnd);
  bool isMaximized = IsZoomed(hwnd);
  bool isNormal = !isMinimized && !isMaximized;

  Napi::Object result = Napi::Object::New(env);
  result.Set("left", Napi::Number::New(env, left));
  result.Set("top", Napi::Number::New(env, top));
  result.Set("right", Napi::Number::New(env, right));
  result.Set("bottom", Napi::Number::New(env, bottom));
  result.Set("width", Napi::Number::New(env, width));
  result.Set("height", Napi::Number::New(env, height));
  result.Set("shownState", Napi::Number::New(env, wp.showCmd));
  result.Set("isMinimized", Napi::Boolean::New(env, isMinimized));
  result.Set("isMaximized", Napi::Boolean::New(env, isMaximized));
  result.Set("isNormal", Napi::Boolean::New(env, isNormal));

  return result;
}

Napi::Value GetLeagueClientWindowSnapshot(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  double processId = info[0].As<Napi::Number>().DoubleValue();
  if (!std::isfinite(processId) || std::floor(processId) != processId ||
      processId < 1 || processId > MAXDWORD) {
    return env.Null();
  }

  // Resolve the current HWND on every read: LeagueClientUx can recreate its window.
  LeagueClientWindowSearch search = {static_cast<DWORD>(processId),
      {static_cast<DWORD>(processId)}, nullptr, -1};
  // LCU belongs to LeagueClient while the RCLIENT surface can belong to its Ux child.
  // Keep the active LCU process as the identity anchor; unrelated RCLIENT windows are excluded.
  HANDLE processes = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (processes != INVALID_HANDLE_VALUE) {
    bool added;
    do {
      added = false;
      PROCESSENTRY32W entry = {};
      entry.dwSize = sizeof(entry);
      if (Process32FirstW(processes, &entry)) do {
        if (search.relatedProcessIds.count(entry.th32ParentProcessID) &&
            search.relatedProcessIds.insert(entry.th32ProcessID).second) added = true;
      } while (Process32NextW(processes, &entry));
    } while (added);
    CloseHandle(processes);
  }
  EnumWindows(FindLeagueClientWindowByProcessId, reinterpret_cast<LPARAM>(&search));
  if (search.hwnd == nullptr) {
    return env.Null();
  }

  // Avoid coordinate virtualization without changing Electron's process/window DPI awareness.
  DPI_AWARENESS_CONTEXT previousDpiContext =
      SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  if (previousDpiContext == nullptr) {
    return env.Null();
  }

  RECT clientRect = {};
  POINT topLeft = {};
  POINT bottomRight = {};
  bool hasBounds = GetClientRect(search.hwnd, &clientRect) != FALSE;
  if (hasBounds) {
    topLeft = {clientRect.left, clientRect.top};
    bottomRight = {clientRect.right, clientRect.bottom};
    hasBounds = ClientToScreen(search.hwnd, &topLeft) && ClientToScreen(search.hwnd, &bottomRight);
  }
  DPI_AWARENESS_CONTEXT restoredDpiContext = SetThreadDpiAwarenessContext(previousDpiContext);
  if (!hasBounds || restoredDpiContext == nullptr) {
    return env.Null();
  }

  HWND foregroundWindow = GetForegroundWindow();
  bool isForeground =
      foregroundWindow != nullptr && GetAncestor(foregroundWindow, GA_ROOT) == search.hwnd;

  Napi::Object bounds = Napi::Object::New(env);
  bounds.Set("x", Napi::Number::New(env, topLeft.x));
  bounds.Set("y", Napi::Number::New(env, topLeft.y));
  bounds.Set("width", Napi::Number::New(env, bottomRight.x - topLeft.x));
  bounds.Set("height", Napi::Number::New(env, bottomRight.y - topLeft.y));

  Napi::Object result = Napi::Object::New(env);
  result.Set("bounds", bounds);
  DWORD ownerProcessId = 0;
  GetWindowThreadProcessId(search.hwnd, &ownerProcessId);
  result.Set("ownerProcessId", Napi::Number::New(env, ownerProcessId));
  result.Set("windowHandle", Napi::String::New(env,
      std::to_string(reinterpret_cast<uintptr_t>(search.hwnd))));
  result.Set("isForeground", Napi::Boolean::New(env, isForeground));
  result.Set("isMinimized", Napi::Boolean::New(env, IsIconic(search.hwnd) != FALSE));
  result.Set("isVisible", Napi::Boolean::New(env, IsWindowVisible(search.hwnd) != FALSE));
  return result;
}

Napi::Value GetGameClientWindowSnapshot(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  double processId = info[0].As<Napi::Number>().DoubleValue();
  if (!std::isfinite(processId) || std::floor(processId) != processId ||
      processId < 1 || processId > MAXDWORD) {
    return env.Null();
  }

  // Selection and ClientToScreen must use the same physical-pixel coordinate space.
  // Restore the caller's thread context before returning; do not change any window.
  DPI_AWARENESS_CONTEXT previousDpiContext =
      SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  if (previousDpiContext == nullptr) return env.Null();

  HWND foregroundWindow = GetForegroundWindow();
  GameClientWindowSearch search = {
      static_cast<DWORD>(processId),
      foregroundWindow ? GetAncestor(foregroundWindow, GA_ROOT) : nullptr,
      nullptr, -1, -1, false};
  bool hasBounds = EnumWindows(FindGameClientWindowByProcessId,
      reinterpret_cast<LPARAM>(&search)) != FALSE &&
      search.hwnd != nullptr && !search.ambiguous;
  DWORD ownerProcessId = 0;
  if (hasBounds) {
    hasBounds = IsWindow(search.hwnd) &&
        GetWindowThreadProcessId(search.hwnd, &ownerProcessId) != 0 &&
        ownerProcessId == search.processId;
  }

  RECT clientRect = {};
  POINT topLeft = {};
  POINT bottomRight = {};
  if (hasBounds) {
    hasBounds = GetClientRect(search.hwnd, &clientRect) != FALSE;
    if (hasBounds) {
      topLeft = {clientRect.left, clientRect.top};
      bottomRight = {clientRect.right, clientRect.bottom};
      hasBounds = ClientToScreen(search.hwnd, &topLeft) &&
          ClientToScreen(search.hwnd, &bottomRight);
    }
  }

  bool isVisible = hasBounds && IsWindowVisible(search.hwnd) != FALSE;
  bool isMinimized = hasBounds && IsIconic(search.hwnd) != FALSE;
  foregroundWindow = GetForegroundWindow();
  bool isForeground = hasBounds && foregroundWindow != nullptr &&
      GetAncestor(foregroundWindow, GA_ROOT) == search.hwnd;
  if (hasBounds) {
    hasBounds = IsWindow(search.hwnd) &&
        GetWindowThreadProcessId(search.hwnd, &ownerProcessId) != 0 &&
        ownerProcessId == search.processId &&
        bottomRight.x >= topLeft.x && bottomRight.y >= topLeft.y;
  }
  DPI_AWARENESS_CONTEXT restoredDpiContext = SetThreadDpiAwarenessContext(previousDpiContext);
  if (!hasBounds || restoredDpiContext == nullptr) return env.Null();

  Napi::Object bounds = Napi::Object::New(env);
  bounds.Set("x", Napi::Number::New(env, topLeft.x));
  bounds.Set("y", Napi::Number::New(env, topLeft.y));
  bounds.Set("width", Napi::Number::New(env, bottomRight.x - topLeft.x));
  bounds.Set("height", Napi::Number::New(env, bottomRight.y - topLeft.y));
  Napi::Object result = Napi::Object::New(env);
  result.Set("ownerProcessId", Napi::Number::New(env, ownerProcessId));
  result.Set("windowHandle", Napi::String::New(env,
      std::to_string(reinterpret_cast<uintptr_t>(search.hwnd))));
  result.Set("bounds", bounds);
  result.Set("isForeground", Napi::Boolean::New(env, isForeground));
  result.Set("isMinimized", Napi::Boolean::New(env, isMinimized));
  result.Set("isVisible", Napi::Boolean::New(env, isVisible));
  return result;
}

Napi::Value IsElevated(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  bool bIsElevated = false;

  BOOL isMember = FALSE;
  PSID administratorsGroup = nullptr;
  SID_IDENTIFIER_AUTHORITY SIDAuthNT = SECURITY_NT_AUTHORITY;

  if (AllocateAndInitializeSid(
          &SIDAuthNT, 2, SECURITY_BUILTIN_DOMAIN_RID, DOMAIN_ALIAS_RID_ADMINS,
          0, 0, 0, 0, 0, 0, &administratorsGroup)) {
    CheckTokenMembership(nullptr, administratorsGroup, &isMember);
  }

  if (administratorsGroup) {
    FreeSid(administratorsGroup);
  }

  bIsElevated = isMember ? true : false;

  return Napi::Boolean::New(env, bIsElevated);
}

bool TerminateProcessByID(DWORD processID) {
  HANDLE hProcess = OpenProcessFromPid(processID, PROCESS_TERMINATE);
  if (hProcess == NULL) {
    std::cerr << "Cannot open process: " << GetLastError() << std::endl;
    return false;
  }

  if (!TerminateProcess(hProcess, 0)) {
    std::cerr << "Cannot terminate process: " << GetLastError() << std::endl;
    CloseHandle(hProcess);
    return false;
  }

  CloseHandle(hProcess);
  return true;
}

Napi::Boolean TerminateProcessNode(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  DWORD processID = info[0].As<Napi::Number>().Uint32Value();
  bool result = TerminateProcessByID(processID);
  return Napi::Boolean::New(env, result);
}

bool IsProcessForeground(DWORD processID) {
  HWND hwndForeground = GetForegroundWindow();
  DWORD foregroundProcID = 0;
  if (hwndForeground == nullptr ||
      GetWindowThreadProcessId(hwndForeground, &foregroundProcID) == 0) return false;
  return (foregroundProcID == processID);
}

Napi::Boolean IsProcessForegroundNode(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  DWORD processID = info[0].As<Napi::Number>().Uint32Value();
  bool isForeground = IsProcessForeground(processID);
  return Napi::Boolean::New(env, isForeground);
}

Napi::Boolean IsProcessRunningNode(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  DWORD processID = info[0].As<Napi::Number>().Uint32Value();
  HANDLE hProcess = OpenProcessFromPid(processID, PROCESS_QUERY_LIMITED_INFORMATION);
  if (hProcess == NULL) {
    return Napi::Boolean::New(env, false);
  }

  CloseHandle(hProcess);
  return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("fixWindowMethodA", Napi::Function::New(env, FixWindowMethodA));
  exports.Set("isElevated", Napi::Function::New(env, IsElevated));
  exports.Set("getLeagueClientWindowPlacementInfo", Napi::Function::New(env, GetLeagueClientWindowPlacementInfo));
  exports.Set("getLeagueClientWindowSnapshot", Napi::Function::New(env, GetLeagueClientWindowSnapshot));
  exports.Set("getGameClientWindowSnapshot", Napi::Function::New(env, GetGameClientWindowSnapshot));
  exports.Set("getCommandLine1", Napi::Function::New(env, GetCommandLine1));
  exports.Set("getPidsByName", Napi::Function::New(env, GetPidsByName));
  exports.Set("terminateProcess", Napi::Function::New(env, TerminateProcessNode));
  exports.Set("isProcessForeground", Napi::Function::New(env, IsProcessForegroundNode));
  exports.Set("isProcessRunning", Napi::Function::New(env, IsProcessRunningNode));
  return exports;
}

NODE_API_MODULE(tools, Init)
