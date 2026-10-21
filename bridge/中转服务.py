#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
中转服务.py —— MHRSB_Cheater 的 Switch 透传中转（一个文件，开关一体，跨平台）
====================================================================
支持：Android(Termux) / Windows / macOS / Linux

用法（就运行这一个脚本）：
    python 中转服务.py

  · 若中转【没在跑】 -> 在后台启动它
  · 若中转【已在跑】 -> 把它停掉

  也可以显式指定：
    python 中转服务.py start     强制启动
    python 中转服务.py stop      强制停止
    python 中转服务.py restart   重启
    python 中转服务.py status    看状态
    python 中转服务.py scan      扫描局域网找 Switch

服务职责（纯透传，不发网页）：
  GET  /status        -> {"ok":true,"connected":bool,"ip":...,"port":...,
                          "titleId":...,"titleVersion":...}
  GET  /scan          -> 扫描局域网找 Switch
  GET  /shutdown      -> 让服务自己退出（跨平台停止用）
  POST /cmd   body=原始命令  -> Switch 的原始回复文本（走长连接，快）
  POST /batch body=json     -> {"cmds":[...]} 一次执行多条，只握手 1 次（快 N 倍）
  POST /cmdwait body=原始命令 -> 等 Switch 回 done（给 clickSeq 用）
  POST /config body=json   -> {"ip":"...","port":6000}  改目标
  OPTIONS *           -> CORS 预检

默认监听 0.0.0.0:6001，目标 Switch 192.168.1.5:6000（可自动扫描）

★ 网页不在这里托管 —— MHRSB_Cheater 用 GitHub Pages，
  页面直接 fetch('http://127.0.0.1:6001/cmd')，浏览器放行本机回环地址。
"""

# ============================================================
#  ★★★ 常用配置（要改就改这里）★★★
# ============================================================
SWITCH_IP = "auto"            # ← Switch 的局域网 IP（"auto" = 自动扫描）
SWITCH_PORT = 6000            # ← sys-agent / sys-botbase 端口（一般不用改）
AUTO_SCAN = True              # ← 连不上时是否自动扫描局域网找 Switch
SCAN_NETS = "192.168.1"       # ← 自动扫描的网段（多个用逗号隔开，如 "192.168.1,192.168.0"）

HOST = "0.0.0.0"              # ← 中转监听地址（0.0.0.0 = 允许别的设备连）
PORT = 6001                   # ← 中转端口（6000 是 NS 的，这里用 6001 好记）
TIMEOUT = 3.0                 # ← 连 Switch 的等待秒数

# ============================================================

import json
import socket
import sys
import os
import re
import time
import threading
import subprocess
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---- Windows 控制台中文不乱码 ----
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

IS_WIN = sys.platform == "win32"


# ---- 也允许命令行覆盖（--port 8080 --ip 192.168.1.5）----
def _argval(flag, default):
    if flag in sys.argv:
        i = sys.argv.index(flag)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


HOST = _argval("--host", HOST)
PORT = int(_argval("--port", str(PORT)))
SWITCH_IP = _argval("--ip", SWITCH_IP)
SWITCH_PORT = int(_argval("--sport", str(SWITCH_PORT)))

SELF = os.path.abspath(__file__)
LOG = os.path.join(os.path.dirname(SELF), "中转日志.log")

# 扫描互斥锁：防止"后台启动扫描"和"页面点连接"同时扫整个网段（会把 CPU/网络打满，
# 而且 /status 会被拖到超时）。谁先拿到谁扫，另一个立刻跳过。
_scan_lock = threading.Lock()


# ============================================================
#  基础：连 Switch 发命令
# ============================================================
def send_cmd(cmd, ip=None, port=None, timeout=TIMEOUT, wait_done=False):
    """连 Switch，发一条命令（自动补 \n），收回复。

    注意：poke / pokeMain / pokeAbsolute 等"只写"命令，Switch 成功时【不回任何东西】，
    如果按普通命令傻等，会一直等到 timeout —— 这是"写入慢"的真凶！
    所以这类命令用"短等待"：发完最多等一小会儿，没回复也视为成功。

    wait_done=True 时：专门给 clickSeq 用 —— Switch 播完序列会回 "done\n"，
    这里就"一直读到 done（或超时）"，从而精确知道"按键播完了"。
    """
    ip = ip or SWITCH_IP
    port = port or SWITCH_PORT
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    head = cmd.split(" ", 1)[0].strip()
    is_write_cmd = head in (
        "poke", "pokeMain", "pokeAbsolute",
        "pokeVerified", "pokeMainVerified", "pokeAbsoluteVerified",
        "write", "click", "press",
        "setController", "detachController", "configure",
        # 冻结相关：Switch 端都不回数据
        "freeze", "unFreeze", "freezeClear", "freezePause", "freezeUnpause",
        # 按键 / 摇杆 / 触屏：也是"只写"，Switch 不回数据
        #   注意 clickSeq 可能跑很久（序列里含 W 等待），这里给"短等待"只是
        #   为了不等满默认 timeout；它本身是异步线程执行，命令立即返回 ✅
        "clickSeq", "clickCancel", "release", "setStick",
        "touchHold", "touchCancel", "touch",
        "key", "keyMod", "keyMulti",
        # ★ sys-agent 新增：这些命令也是"只写"或者处理完不回数据
        "memoryBackend", "ftpStart", "ftpStop", "ftpRestart", "ftpReload",
        "searchCancel", "searchClose",
        "debug", "watchStop", "bootUnlock",
        "systemReboot", "systemRebootEmuMMC", "systemShutdown", "systemSleep",
        "networkSet", "lockScreenSet", "applicationTerminate",
    )
    if wait_done:
        wait_timeout = timeout      # 等 done 用长超时（序列可能很长）
    else:
        # ⚡ 写命令（poke/pokeMain/click/clickSeq...）Switch 不回数据：
        #    sendall 发出后短暂等一下（确保数据上线）就返回
        wait_timeout = 0.04 if is_write_cmd else timeout
    s.settimeout(wait_timeout)
    try:
        s.connect((ip, port))
        if not cmd.endswith("\n"):
            cmd += "\n"
        s.sendall(cmd.encode("utf-8"))
        buf = b""
        while True:
            try:
                c = s.recv(4096)
            except socket.timeout:
                break
            if not c:
                break
            buf += c
            if wait_done:
                if b"done" in buf:
                    break        # ⚡ 按键播完了
            elif buf.endswith(b"\n"):
                break
        return True, buf.decode("utf-8", errors="replace")
    except Exception as e:
        return False, str(e)
    finally:
        s.close()


# ============================================================
#  ★ 长连接池：复用 TCP 连接，避免"每条命令都建连/断连"
#
#  实测（MHRSB 16.0.2，真机）：
#    · 每次新建连接   → 89~198 ms/条
#    · 复用同一条连接 → 51~57  ms/条   ← 约快一倍
#  连接建立本身只要 6ms，说明开销大头在 connect/close 的握手与状态清理。
# ============================================================
WRITE_HEADS = (
    "poke", "pokeMain", "pokeAbsolute",
    "pokeVerified", "pokeMainVerified", "pokeAbsoluteVerified",
    "write", "click", "press", "clickSeq", "clickCancel", "release",
    "setController", "detachController", "configure",
    "freeze", "unFreeze", "freezeClear", "freezePause", "freezeUnpause",
    "setStick", "touchHold", "touchCancel", "touch",
    "key", "keyMod", "keyMulti",
    "memoryBackend", "ftpStart", "ftpStop", "ftpRestart", "ftpReload",
    "searchCancel", "searchClose",
    "debug", "watchStop", "bootUnlock",
    "systemReboot", "systemRebootEmuMMC", "systemShutdown", "systemSleep",
    "networkSet", "lockScreenSet", "applicationTerminate",
)

# 长连接的读空闲超时：超过这么久没用就主动断开，避免拿到游戏重开后的死连接
POOL_IDLE_MAX = 20.0

_pool_sock = None
_pool_addr = None
_pool_used_at = 0.0
_pool_lock = threading.Lock()


def _pool_close_nolock():
    global _pool_sock, _pool_addr
    if _pool_sock is not None:
        try:
            _pool_sock.close()
        except Exception:
            pass
    _pool_sock = None
    _pool_addr = None


def pool_close():
    with _pool_lock:
        _pool_close_nolock()


def _pool_open_nolock(ip, port, timeout):
    global _pool_sock, _pool_addr, _pool_used_at
    _pool_close_nolock()
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    except Exception:
        pass
    s.connect((ip, port))
    _pool_sock = s
    _pool_addr = (ip, port)
    _pool_used_at = time.time()


def _pool_send_recv_nolock(s, cmd, is_write, timeout):
    """在同一条连接上发一条命令并收回复（调用方已持锁）。"""
    wire = cmd if cmd.endswith("\n") else (cmd + "\n")
    if is_write:
        s.settimeout(0.05)
        s.sendall(wire.encode("utf-8"))
        # 写命令不回数据：短暂探一下，有就丢掉
        try:
            s.settimeout(0.015)
            s.recv(4096)
        except Exception:
            pass
        return ""
    s.settimeout(timeout)
    s.sendall(wire.encode("utf-8"))
    buf = b""
    while True:
        try:
            c = s.recv(65536)
        except socket.timeout:
            break
        if not c:
            break
        buf += c
        if buf.endswith(b"\n"):
            break
    return buf.decode("utf-8", errors="replace")


def pool_cmd(cmd, ip=None, port=None, timeout=TIMEOUT):
    """单条命令走长连接。语义与 send_cmd 一致，但快一倍。"""
    ip = ip or SWITCH_IP
    port = port or SWITCH_PORT
    head = cmd.split(" ", 1)[0].strip()
    is_write = head in WRITE_HEADS

    with _pool_lock:
        global _pool_used_at
        for attempt in (0, 1):
            try:
                stale = (_pool_sock is None
                         or _pool_addr != (ip, port)
                         or (time.time() - _pool_used_at) > POOL_IDLE_MAX)
                if stale:
                    _pool_open_nolock(ip, port, timeout)
                out = _pool_send_recv_nolock(_pool_sock, cmd, is_write, timeout)
                _pool_used_at = time.time()
                return True, out
            except Exception as e:
                _pool_close_nolock()
                if attempt == 1:
                    return False, str(e)
        return False, "unknown"


def send_batch(cmds, ip=None, port=None, timeout=TIMEOUT):
    """在【一条连接】上依次执行多条命令，返回结果列表。

    这是提速的核心：N 条命令只握手 1 次（而不是 N 次）。
    返回 [{"ok":bool,"out":str}, ...]，长度与 cmds 相同。
    """
    ip = ip or SWITCH_IP
    port = port or SWITCH_PORT

    results = []
    with _pool_lock:
        global _pool_used_at
        try:
            stale = (_pool_sock is None
                     or _pool_addr != (ip, port)
                     or (time.time() - _pool_used_at) > POOL_IDLE_MAX)
            if stale:
                _pool_open_nolock(ip, port, timeout)

            s = _pool_sock
            for cmd in cmds:
                head = cmd.split(" ", 1)[0].strip()
                is_write = head in WRITE_HEADS
                try:
                    out = _pool_send_recv_nolock(s, cmd, is_write, timeout)
                    results.append({"ok": True, "out": out})
                except Exception as e:
                    results.append({"ok": False, "out": str(e)})
                    _pool_close_nolock()
                    # 连接已断，剩余命令全部标失败
                    while len(results) < len(cmds):
                        results.append({"ok": False, "out": "connection lost"})
                    break
            _pool_used_at = time.time()
        except Exception as e:
            _pool_close_nolock()
            return [{"ok": False, "out": str(e)} for _ in cmds]

    return results


# ============================================================
#  自动扫描：在局域网里找 Switch（sys-agent 6000 端口）
# ============================================================
def _probe_switch(ip, port=None, timeout=0.6):
    """连一下 ip:port，发 getVersion，能收到版本号就返回版本字符串，否则 None。"""
    port = port or SWITCH_PORT
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        s.connect((ip, port))
        s.sendall(b"getVersion\n")
        data = s.recv(64)
        s.close()
        txt = data.decode("utf-8", errors="replace").strip()
        # sys-botbase 返回 "2.5"，sys-agent 返回 "2.14.0"
        if txt and all(c.isdigit() or c == "." for c in txt) and len(txt) <= 12:
            return txt
    except Exception:
        pass
    return None


def _is_ipv4(s):
    """简单判断是不是合法 IPv4。"""
    p = s.split(".")
    return len(p) == 4 and all(x.isdigit() and 0 <= int(x) <= 255 for x in p)


def _local_ipv4s():
    """拿到本机所有的 IPv4 地址（用来推网段）。

    多来源收集：
      ① hostname -I  （Linux/安卓/Termux 最靠谱）
      ② ipconfig     （Windows）
      ③ 连外网拿默认出口 IP
      ④ 主机名解析
    """
    ips = []

    def add(x):
        if x and x not in ips:
            ips.append(x)

    # ① hostname -I
    try:
        out = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=3).stdout
        for tok in out.split():
            if _is_ipv4(tok):
                add(tok)
    except Exception:
        pass

    # ② Windows: ipconfig
    if IS_WIN:
        try:
            out = subprocess.run(["ipconfig"], capture_output=True, text=True, timeout=5,
                                 encoding="gbk", errors="replace").stdout
            for tok in out.replace(":", " ").split():
                if _is_ipv4(tok):
                    add(tok)
        except Exception:
            pass

    # ③ 连外网拿默认出口 IP（不真发包）
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.3)
        try:
            s.connect(("8.8.8.8", 80))
            add(s.getsockname()[0])
        except Exception:
            pass
        finally:
            s.close()
    except Exception:
        pass

    # ④ 主机名解析
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            add(info[4][0])
    except Exception:
        pass

    # 排除回环
    return [ip for ip in ips if not ip.startswith("127.")]


def scan_switch(port=None, verbose=True):
    """扫描局域网找 Switch，返回找到的 IP（找不到返回 None）。

    网段来源（按顺序，都扫）：
      ⓪ SCAN_NETS 里手动写的网段（最可靠，优先！）
      ① 配置 IP 的网段
      ② 本机所有网卡的网段（可能只有虚拟网卡，不一定有用）
    """
    port = port or SWITCH_PORT
    prefixes = []

    def addpre(pre):
        if pre and pre not in prefixes:
            prefixes.append(pre)

    # ⓪ 手动配置的网段（最优先）
    if SCAN_NETS:
        for s in str(SCAN_NETS).replace(" ", "").split(","):
            if s:
                addpre(s)
    # ① 配置 IP 的网段
    parts = str(SWITCH_IP).split(".")
    if len(parts) == 4 and all(p.isdigit() for p in parts):
        addpre(".".join(parts[:3]))
    # ② 本机网卡的网段
    for ip in _local_ipv4s():
        p = ip.split(".")
        if len(p) == 4:
            addpre(".".join(p[:3]))

    if verbose:
        print("[扫描] 网段：%s.x  端口：%d" % (", ".join(prefixes), port), flush=True)

    found = []

    def worker(ip):
        if found:
            return
        ver = _probe_switch(ip, port)
        if ver:
            found.append((ip, ver))

    threads = []
    for pre in prefixes:
        for n in range(1, 255):
            ip = "%s.%d" % (pre, n)
            t = threading.Thread(target=worker, args=(ip,), daemon=True)
            threads.append(t)
    # 分批启动，避免一次开太多线程
    BATCH = 64
    for i in range(0, len(threads), BATCH):
        batch = threads[i:i + BATCH]
        for t in batch:
            t.start()
        for t in batch:
            t.join(timeout=1.2)
        if found:
            break

    if found:
        if verbose:
            print("[扫描] ✅ 找到 Switch：%s （版本 %s）" % (found[0][0], found[0][1]), flush=True)
        return found[0][0]
    if verbose:
        print("[扫描] ❌ 没找到 Switch（检查：Switch 是否开机、是否连同一个 WiFi、是否跑了 sys-agent）", flush=True)
    return None


def resolve_switch(verbose=True):
    """确定要用的 Switch IP：配置的能用就用，否则（允许的话）自动扫描。

    ⚠️ 加了"防重入"：如果后台线程正在扫，这里立刻返回 None，
    不要傻等——否则 /status 请求会被拖到超时，页面以为服务挂了。
    """
    global SWITCH_IP
    # 配置成 auto → 直接扫
    if str(SWITCH_IP).lower() == "auto":
        if not _scan_lock.acquire(blocking=False):
            if verbose:
                print("[扫描] 已有扫描在进行中，先跳过", flush=True)
            return None
        try:
            ip = scan_switch(verbose=verbose)
        finally:
            _scan_lock.release()
        if ip:
            SWITCH_IP = ip      # ← 关键：扫到就更新，下次不用再扫
        return ip
    # 配置的 IP 能连 → 直接用
    if _probe_switch(SWITCH_IP, SWITCH_PORT, timeout=1.0):
        return SWITCH_IP
    # 连不上，且允许扫描 → 扫描（同样防重入）
    if AUTO_SCAN:
        if not _scan_lock.acquire(blocking=False):
            if verbose:
                print("[扫描] 已有扫描在进行中，先跳过", flush=True)
            return None
        try:
            if verbose:
                print("[扫描] 配置的 IP（%s）连不上，开始自动扫描…" % SWITCH_IP, flush=True)
            ip = scan_switch(verbose=verbose)
        finally:
            _scan_lock.release()
        if ip:
            SWITCH_IP = ip
            return ip
    return None


# ============================================================
#  HTTP 处理（纯透传）
# ============================================================
class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Chrome 私有网络访问（HTTPS 页面 → http://127.0.0.1 需要这个预检头）
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _text(self, body, code=200):
        b = (body if isinstance(body, str) else str(body)).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(b)

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/status":
            # ⚠️ 这里【只做快速探测】，绝不主动扫网段：
            #    /status 是页面每次点「连接」都要调的接口，如果它卡在扫描上，
            #    页面会等十几秒才报错，体验极差。
            #    扫描交给：① 后台启动线程 ② /scan 接口（用户主动点「扫描」）
            ok, _ = pool_cmd("getVersion")
            info = {
                "ok": True,
                "connected": ok,
                "ip": SWITCH_IP,
                "port": SWITCH_PORT,
                "pooled": True,
                "scanning": _scan_lock.locked(),
            }
            if ok:
                # ★ 连上时顺带带出游戏信息，前端可直接做"版本自动识别"
                try:
                    _, tid = pool_cmd("getTitleID")
                    info["titleId"] = (tid or "").strip()
                except Exception:
                    pass
                try:
                    _, tver = pool_cmd("getTitleVersion")
                    info["titleVersion"] = (tver or "").strip()
                except Exception:
                    pass
                try:
                    _, agent = pool_cmd("getVersion")
                    info["agentVersion"] = (agent or "").strip()
                except Exception:
                    pass
            self._json(info)
        elif path == "/scan":
            ip = scan_switch(verbose=True)
            self._json({"ok": bool(ip), "found": ip or "", "ip": SWITCH_IP, "port": SWITCH_PORT})
        elif path == "/peek":
            # 快速探测（不扫网段，1 秒内出结果）—— 页面用来判断"中转连不连得上"
            ver = _probe_switch(SWITCH_IP, SWITCH_PORT, timeout=1.0)
            self._json({"ok": True, "reachable": bool(ver), "ip": SWITCH_IP,
                        "port": SWITCH_PORT, "agentVersion": ver or ""})
        elif path == "/shutdown":
            self._json({"ok": True, "msg": "bye"})
            # 在另一个线程里稍后关掉，确保响应能发出去
            threading.Thread(target=_delayed_exit, daemon=True).start()
        elif path == "/":
            self._json({"ok": True, "msg": "MHRSB_Cheater 中转（sys-agent 透传）",
                        "NS": "%s:%d" % (SWITCH_IP, SWITCH_PORT),
                        "端口": PORT,
                        "接口": ["GET /status", "GET /scan", "POST /cmd", "POST /cmdwait", "POST /config"]})
        else:
            self._json({"ok": False, "error": "unknown path"}, 404)

    def do_POST(self):
        global SWITCH_IP, SWITCH_PORT
        path = urllib.parse.urlparse(self.path).path
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n).decode("utf-8", errors="replace") if n else ""

        if path == "/cmd":
            ok, resp = pool_cmd(raw)
            self._text((resp if ok else ("ERROR: " + resp)), 200 if ok else 502)
        elif path == "/batch":
            # ⚡ 批量执行：body = JSON
            #    {"cmds": ["peekAbsolute 0x... 8", "peekAbsolute 0x... 8", ...]}
            #    全部在【同一条 TCP 连接】上串行执行，只握手 1 次。
            #    响应：{"ok":true,"n":N,"results":["hex...", "hex...", ...]}
            #    失败项为 null（并带 "errors" 数组说明）
            try:
                req = json.loads(raw or "{}")
                cmds = req.get("cmds") or []
                if not isinstance(cmds, list):
                    raise ValueError("cmds 必须是数组")
                if len(cmds) > 4000:
                    raise ValueError("单次最多 4000 条命令")
                res = send_batch([str(c) for c in cmds])
                outs = []
                errs = []
                for i, r in enumerate(res):
                    if r.get("ok"):
                        outs.append(r.get("out", ""))
                    else:
                        outs.append(None)
                        errs.append({"i": i, "err": r.get("out", "")})
                resp = {"ok": len(errs) == 0, "n": len(cmds), "results": outs}
                if errs:
                    resp["errors"] = errs
                self._json(resp)
            except Exception as e:
                self._json({"ok": False, "error": str(e)}, 400)
        elif path == "/cmdwait":
            # ⚡ 发命令并"一直等到 Switch 回 done"（给 clickSeq 用）
            #    响应体 = "done <ms>"（成功）/ "timeout <ms>" / "ERROR: ..."
            t0 = time.time()
            ok, resp = send_cmd(raw, wait_done=True)
            used = int((time.time() - t0) * 1000)
            if ok and "done" in resp:
                self._text("done %d" % used, 200)
            elif ok:
                self._text("timeout %d" % used, 200)
            else:
                self._text("ERROR: " + resp, 502)
        elif path == "/config":
            try:
                cfg = json.loads(raw or "{}")
                changed = False
                if "ip" in cfg and cfg["ip"] != SWITCH_IP:
                    SWITCH_IP = cfg["ip"]
                    changed = True
                if "port" in cfg and int(cfg["port"]) != SWITCH_PORT:
                    SWITCH_PORT = int(cfg["port"])
                    changed = True
                if changed:
                    pool_close()      # 目标变了，旧长连接作废
                self._json({"ok": True, "ip": SWITCH_IP, "port": SWITCH_PORT})
            except Exception as e:
                self._json({"ok": False, "error": str(e)}, 400)
        else:
            self._json({"ok": False, "error": "unknown path"}, 404)

    def log_message(self, fmt, *args):
        pass  # 静音


# 全局 server 引用（供 /shutdown 用）
_SERVER = None


def _delayed_exit():
    time.sleep(0.3)
    os._exit(0)


# ============================================================
#  开关逻辑（跨平台）
# ============================================================
def is_running():
    """探端口：能连上 PORT 且返回我们的 JSON 就算在跑。"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.5)
        s.connect(("127.0.0.1", PORT))
        s.sendall(b"GET /status HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n")
        data = b""
        while True:
            try:
                c = s.recv(1024)
            except socket.timeout:
                break
            if not c:
                break
            data += c
        s.close()
        return b"connected" in data or b"ok" in data
    except Exception:
        return False


def _http_get(path, timeout=3.0):
    """跨平台发一个极简 HTTP GET（不用 urllib，避免代理等干扰）。"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        s.connect(("127.0.0.1", PORT))
        req = ("GET %s HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n" % path).encode("utf-8")
        s.sendall(req)
        data = b""
        while True:
            try:
                c = s.recv(1024)
            except socket.timeout:
                break
            if not c:
                break
            data += c
        s.close()
        return True, data.decode("utf-8", errors="replace")
    except Exception as e:
        return False, str(e)


def do_stop():
    """停止：优先用 /shutdown 让服务自杀（跨平台最干净），失败再退回杀进程。"""
    if not is_running():
        print("[i] 中转当前没在运行")
        return
    # ① 优雅：请服务自己退出
    _http_get("/shutdown")
    time.sleep(1.0)
    if not is_running():
        print("[OK] 中转已停止")
        return
    # ② 兜底：杀进程
    killed = kill_bridge_fallback()
    time.sleep(0.5)
    if is_running():
        print("[!] 还没停干净（可能被别的程序占了 %d 端口）" % PORT)
    else:
        print("[OK] 中转已停止" + ("（PID %s）" % killed if killed else ""))


def kill_bridge_fallback():
    """按平台杀掉跑着本脚本的进程（除自己）。"""
    me = os.getpid()
    name = os.path.basename(SELF)
    pids = _find_pids(name)
    killed = []
    for pid in pids:
        if pid == me:
            continue
        try:
            if IS_WIN:
                subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                               capture_output=True, timeout=5)
            else:
                os.kill(pid, 15)
            killed.append(pid)
        except Exception:
            pass
    if not IS_WIN:
        time.sleep(1)
        for pid in _find_pids(name):
            if pid == me:
                continue
            try:
                os.kill(pid, 9)
            except Exception:
                pass
    return killed


def _find_pids(name):
    """跨平台找进程 PID（按命令行包含 name）。"""
    pids = []
    try:
        if IS_WIN:
            out = subprocess.run(
                ["wmic", "process", "get", "ProcessId,CommandLine", "/format:csv"],
                capture_output=True, text=True, timeout=8
            ).stdout
            for line in out.splitlines():
                if name in line:
                    tail = line.strip().split(",")[-1].strip()
                    if tail.isdigit():
                        pids.append(int(tail))
        else:
            out = subprocess.run(["pgrep", "-f", name],
                                 capture_output=True, text=True, timeout=5).stdout
            for line in out.split():
                if line.strip().isdigit():
                    pids.append(int(line.strip()))
    except Exception:
        pass
    return pids


def _spawn_detached(args, logf):
    """跨平台后台启动（分离进程）。

    注意：必须把 --port/--ip/--host/--sport 等自定义参数【原样传下去】，
    否则子进程会回到默认值。
    """
    kwargs = dict(stdout=logf, stderr=logf, stdin=subprocess.DEVNULL,
                  cwd=os.path.dirname(SELF))
    if IS_WIN:
        kwargs["creationflags"] = (subprocess.CREATE_NEW_PROCESS_GROUP
                                   | getattr(subprocess, "DETACHED_PROCESS", 0x00000008))
    else:
        kwargs["start_new_session"] = True
    cmdline = [sys.executable, SELF, "--serve"] + _passthrough_args() + args
    return subprocess.Popen(cmdline, **kwargs)


def _passthrough_args():
    """提取需要透传给子进程的参数（--port/--ip/--host/--sport）。"""
    out = []
    for flag in ("--host", "--port", "--ip", "--sport"):
        if flag in sys.argv:
            i = sys.argv.index(flag)
            if i + 1 < len(sys.argv):
                out += [flag, sys.argv[i + 1]]
    return out


def _pick_lan_ip():
    """找一个"局域网 IP"，用来告诉用户别的设备该怎么访问中转。"""
    ips = _local_ipv4s()
    for ip in ips:
        if ip.startswith("192.168.") or ip.startswith("10."):
            return ip
    for ip in ips:
        if ip.startswith("172."):
            p = ip.split(".")
            if len(p) >= 2 and p[1].isdigit() and 16 <= int(p[1]) <= 31:
                return ip
    return ips[0] if ips else ""


def _resolve_ip_for_display():
    """给"显示用"的 NS IP：如果配置是 auto，就现场解析一次（优先用中转已解析的）。"""
    global SWITCH_IP
    if str(SWITCH_IP).lower() != "auto":
        return SWITCH_IP
    try:
        ok, body = _http_get("/status", timeout=2.5)
        if ok:
            m = re.search(r'"ip"\s*:\s*"([^"]+)"', body)
            if m and m.group(1) and m.group(1).lower() != "auto":
                SWITCH_IP = m.group(1)
                return SWITCH_IP
    except Exception:
        pass
    try:
        ip = scan_switch(verbose=False)
        if ip:
            SWITCH_IP = ip
            return ip
    except Exception:
        pass
    return None


def _banner(title):
    """打印当前状态：NS IP、中转端口、页面地址。"""
    lan = _pick_lan_ip()
    ns_ip = _resolve_ip_for_display()
    ns_txt = ("%s:%d" % (ns_ip, SWITCH_PORT)) if ns_ip else ("auto（自动扫描中）:%d" % SWITCH_PORT)
    print("")
    print("=" * 60)
    print("  %s" % title)
    print("-" * 60)
    print("  NS (sys-agent)   : %s" % ns_txt)
    print("  中转监听         : %s:%d" % (HOST, PORT))
    print("  中转接口(本机)   : http://127.0.0.1:%d/cmd" % PORT)
    if lan:
        print("  中转接口(局域网) : http://%s:%d/cmd" % (lan, PORT))
    print("-" * 60)
    print("  页面：https://hihuiol.github.io/MHRSB_Cheater/index.html")
    print("  （页面会自动连 http://127.0.0.1:%d）" % PORT)
    print("=" * 60)
    print("")


def do_start(extra_args=None):
    """启动服务。

    · Windows：直接【前台】运行（窗口活着 = 服务活着，关窗口 = 停止）。
    · 其它平台：后台分离运行（Termux 里方便）。
    """
    if is_running():
        print("[!] 中转已经在运行了（%d 端口已监听）" % PORT)
        print("    想停止请再运行一次： python 中转服务.py")
        _banner("当前状态")
        return

    if IS_WIN:
        print("[i] Windows：前台运行（关掉本窗口即停止中转）")
        serve_forever()
        return

    extra_args = extra_args or []
    with open(LOG, "ab") as logf:
        _spawn_detached(extra_args, logf)
    for _ in range(10):
        time.sleep(0.5)
        if is_running():
            print("[OK] 中转已启动（后台运行）")
            print("     日志：%s" % LOG)
            print("     再运行一次本脚本即可停止。")
            _banner("运行中")
            return
    print("[X] 启动失败，请看日志：%s" % LOG)
    try:
        with open(LOG, "r", encoding="utf-8", errors="replace") as f:
            print("\n".join(f.read().splitlines()[-10:]))
    except Exception:
        pass


def do_status():
    if is_running():
        print("[*] 中转运行中  http://127.0.0.1:%d" % PORT)
        _banner("当前状态")
    else:
        print("[ ] 中转未运行")


def serve_forever():
    """真正的服务入口。

    ⚠️ 关键顺序：**先监听端口，再后台异步解析 Switch IP**。
    原版是"先 resolve_switch() 再监听"——如果配置成 auto，启动时要扫整个网段
    （几十秒），期间 HTTP 端口根本没起来，客户端会连不上、以为服务挂了。
    """
    import errno
    global SWITCH_IP

    try:
        srv = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as e:
        if e.errno in (errno.EADDRINUSE, 98, 10048):
            print("[错误] 端口 %d 已被占用！" % PORT, flush=True)
            print("可能已在运行。用本脚本不带参数运行可自动处理。", flush=True)
            return
        raise
    global _SERVER
    _SERVER = srv

    print("")
    print("=" * 60)
    print("  MHRSB_Cheater 中转 已启动（sys-agent 透传）")
    print("-" * 60)
    print("  中转监听         : %s:%d   ← 已在监听，页面可连" % (HOST, PORT))
    print("  中转接口         : http://127.0.0.1:%d/cmd" % PORT)
    _lan = _pick_lan_ip()
    if _lan:
        print("  局域网访问       : http://%s:%d/cmd" % (_lan, PORT))
    print("=" * 60)
    print("")
    print("[..] 正在后台解析 Switch IP（配置=%s）…" % SWITCH_IP, flush=True)

    # ★ 后台线程解析 Switch，不阻塞 HTTP 服务
    def _resolve_bg():
        global SWITCH_IP
        try:
            ip = resolve_switch(verbose=True)
            if ip:
                SWITCH_IP = ip
                print("[OK] 已连接 NS：%s:%d" % (SWITCH_IP, SWITCH_PORT), flush=True)
            else:
                print("[!] 暂未找到 NS（检查：NS 开机 / 同一 WiFi / 跑了 sys-agent）", flush=True)
                print("    页面点「重新连接」会再试一次。", flush=True)
        except Exception as e:
            print("[!] 自动解析 NS 失败：%s" % e, flush=True)

    threading.Thread(target=_resolve_bg, daemon=True).start()

    srv.serve_forever()


# ============================================================
#  入口
# ============================================================
def _pause_if_double_clicked(had_args):
    """双击运行（Windows + 无参数）时，跑完停一下，别让窗口一闪而过。"""
    if had_args:
        return
    if not IS_WIN:
        return
    try:
        input("\n按回车键关闭窗口...")
    except Exception:
        pass


def main():
    # 提取"动作"参数（跳过 --xxx 及其值）
    PAIR_FLAGS = ("--host", "--port", "--ip", "--sport")
    args = []
    i = 1
    while i < len(sys.argv):
        a = sys.argv[i]
        if a in PAIR_FLAGS:
            i += 2          # 跳过 flag + 它的值
            continue
        args.append(a)
        i += 1

    # 隐藏参数：真正跑服务
    if "--serve" in args:
        serve_forever()
        return

    had_args = len(args) > 0      # 有没有带"动作"参数（双击 = False）

    cmd = args[0].lower() if args else "toggle"

    if cmd in ("start", "开", "on"):
        do_start()
    elif cmd in ("stop", "关", "off", "kill"):
        do_stop()
    elif cmd == "restart":
        do_stop()
        time.sleep(0.5)
        do_start()
    elif cmd == "status":
        do_status()
    elif cmd in ("scan", "扫描", "find"):
        global SWITCH_IP
        ip = scan_switch(verbose=True)
        if ip:
            SWITCH_IP = ip
            print("[OK] 找到并已使用：%s:%d" % (SWITCH_IP, SWITCH_PORT))
        else:
            print("[X] 没找到 Switch")
    else:
        # 默认：开关切换
        if is_running():
            do_stop()
        else:
            do_start()

    _pause_if_double_clicked(had_args)


if __name__ == "__main__":
    main()