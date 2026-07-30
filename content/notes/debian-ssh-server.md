---
title: 在n150小主机上安装Debian并配置为SSH Server
date: 2026-06-10
tags:
  - debian
  - ssh
summary: 在n150小主机上安装Debian并配置为SSH Server，在主力机上使用ssh远程连接并管理小主机。
draft: false
---
### 安装
- 插上u盘，小主机网线脸上路由器，hdmi脸上屏幕开机后不停按del进入bios，使用u盘启动。选择图形化安装，安装过程中选择英文；root用户不设密码；安装镜像选择中科大源；最后勾选上
- [x] SSH server
- [x] standard system utilities
>root密码留空后，ssh时只能使用普通账户登录Debian小主机，用`sudo`提权，使用`su`进入root环境
>我第一次选清华源装不上，最后换成中科大源好了，不知道为什么。我在天津。

- 安装成功后拔下u盘、hdmi和键盘。现在这台小主机可以和路由器一样仍在角落里放着了。
### 使用ssh连接Debian小主机
- 如果安装Debian时没有给Debian分配静态ip，可以去路由器的管理后台下查看路由器给小主机分配的动态ip是多少。
- 在`kitty`终端中使用`TERM=xterm-256color ssh statindet@192.168.31.215`连上小主机。
>使用`TERM=xterm-256color`参数让ssh连接使用当前的终端类型。如果不设置，在后面使用`nano`编辑脚本的时候会报错

更新系统
```bash
sudo apt update && sudo apt upgrade -y
```
换源
```bash
sudo nano /etc/apt/sources.list
```

```
#deb cdrom:[Debian GNU/Linux 13.5.0 _Trixie_ - Official amd64 NETINST with firmware 20260516-10:08]/ tr>

deb http://mirrors.ustc.edu.cn/debian/ trixie main non-free-firmware
deb-src http://mirrors.ustc.edu.cn/debian/ trixie main non-free-firmware

#deb http://security.debian.org/debian-security trixie-security main non-free-firmware
#deb-src http://security.debian.org/debian-security trixie-security main non-free-firmware

deb http://mirrors.ustc.edu.cn/debian-security/ trixie-security main contrib non-free non-free-firmware
deb-src http://mirrors.ustc.edu.cn/debian-security/ trixie-security main contrib non-free non-free-firm>

# trixie-updates, to get updates before a point release is made;
# see https://www.debian.org/doc/manuals/debian-reference/ch02.en.html#_updates_and_backports
deb http://mirrors.ustc.edu.cn/debian/ trixie-updates main non-free-firmware
deb-src http://mirrors.ustc.edu.cn/debian/ trixie-updates main non-free-firmware

# This system was installed using removable media other than
# CD/DVD/BD (e.g. USB stick, SD card, ISO image file).
# The matching "deb cdrom" entries were disabled at the end
# of the installation process.
# For information about how to configure apt package sources,
# see the sources.list(5) manual.
```
>在图形化安装过程中即使换过了中科大的源，`sources.list`中的 security 源仍然是官方源，下载速度会非常慢。

`ctrl+o`保存，`ctrl+x`退出。

### 配置ssh密钥，方便以后免密登录。

现在 Arch Linux 上检查有没有 SSH 密钥：
```bash
ls ~/.ssh/id_ed25519.pub
```
没有的话创建一个：
```bash
ssh-keygen -t ed25519
```
把公钥复制到 Debian 小主机：
```bash
ssh-copy-id statindet@192.168.31.215
```
之后在登录就不需要使用密码了，或者只需要输入创建密钥时输入的密码。
- 可以给 SSH 写一个别名`nvim ~/.ssh/config`
```
Host debian
    HostName 192.168.31.215
    User statindet
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```
以后就可以直接使用 `ssh debian`登录Debian小主机了。

### 自动关机脚本
- 确定时区
```
timedatectl
date
```
- 如果不是中国时区，进行修改：
```bash
sudo timedatectl set-timezone Asia/Shanghai
```
- 开启网络校时间：
```bash
sudo timedatectl set-ntp true
```
>时区的设置一般安装Debian的时候就默认配置好了，大部分情况都不需要修改。

1. 创建自动关机 service
```bash
sudo nano /etc/systemd/system/nightly-shutdown.service
```
写入：
```
[Unit]
Description=Shutdown before dormitory power cut

[Service]
Type=oneshot
ExecStart=/usr/sbin/shutdown -h +1 "Auto shutdown before dormitory power cut"
```
这里的意思是：触发后，系统会在 1 分钟后关机。这样你临时想取消时还有一点缓冲时间。

2. 创建每天定时触发的 timer
```bash
sudo nano /etc/systemd/system/nightly-shutdown.timer
```
写入：
```
[Unit]
Description=Daily shutdown before dormitory power cut

[Timer]
OnCalendar=*-*-* 22:50:00
Persistent=false
Unit=nightly-shutdown.service

[Install]
WantedBy=timers.target
```

`OnCalendar=*-*-* 22:50:00` 表示每天 22:50 触发。

`Persistent=false` 很重要：如果小主机晚上断电，第二天来电启动时不会因为“错过了昨晚的关机任务”而立刻又关机。

3. 启动定时关机
执行：
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nightly-shutdown.timer
```
查看是否启用：
```
systemctl is-enabled nightly-shutdown.timer
systemctl status nightly-shutdown.timer
```
查看下一次出发时间:
```bash
systemctl list-timers --all | grep nightly-shutdown
```
#### 如果当天临时不想自动关机

如果已经进入 22:45 后、系统提示即将关机，可以取消：

```bash
sudo shutdown -c
```

如果你想临时停掉这个定时器：

```bash
sudo systemctl stop nightly-shutdown.timer
```

如果想彻底禁用：

```bash
sudo systemctl disable --now nightly-shutdown.timer
```

以后重新启用：

```bash
sudo systemctl enable --now nightly-shutdown.timer
```

#### 启用 libvirt-guests

为了让虚拟机在宿主机关机前尽量正常关机，执行：

```
systemctl status libvirt-guests
```

如果存在这个服务，启用它：

```bash
sudo systemctl enable --now libvirt-guests
```

然后编辑配置：

```bash
sudo nano /etc/default/libvirt-guests
```

建议设置成：

```
ON_SHUTDOWN=shutdown
SHUTDOWN_TIMEOUT=300
PARALLEL_SHUTDOWN=2
```

意思是：宿主机关机时，先尝试正常关闭虚拟机，最多等 300 秒。