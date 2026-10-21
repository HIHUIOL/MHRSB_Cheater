#!/data/data/com.termux/files/usr/bin/bash
# MHRSB_Cheater 中转服务 —— Termux 启动器
# 用法：bash 中转服务.sh            （开关一体：没跑就启动，在跑就停）
#       bash 中转服务.sh status     （看状态）

export PREFIX=/data/data/com.termux/files/usr
export HOME=/data/data/com.termux/files/home
export PATH=$PREFIX/bin:$PATH
export LD_LIBRARY_PATH=$PREFIX/lib:$LD_LIBRARY_PATH

cd "$(dirname "$0")"
SCRIPT="${0%.sh}.py"

# Termux 下用 python，其他环境退到 python3
if command -v python >/dev/null 2>&1; then
    python "$SCRIPT" "$@"
else
    python3 "$SCRIPT" "$@"
fi