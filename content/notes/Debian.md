---
title: "安装 Debian SSH 服务器记录"
date: "2026-06-09"
slug: "debian-ssh-server"
summary: "记录在小主机上安装 Debian SSH Server，并规划 Docker、虚拟机和同步服务。"
draft: false
---

### 安装Debian ssh服务器记录
> 重装并卸载飞牛，改用原生Debian，顺带学习一下docker。
> 飞牛还没有计划任务，每次来电自启动后docker服务还需手动修复，对于我们每晚断电的大学宿舍来说来说极不友好。
> 所以与其继续在飞牛上面修修补补，我选择改用原生Debian，这次只装我自己需要的应用。
### 资源清单

| 类别  | 型号 / 内容                                        | 备注              |
| --- | ---------------------------------------------- | --------------- |
| 小主机 | 中柏 Jumper 英特尔 13 代 N150 mini 小主机，双网口，无内存硬盘     | 687.67 元        |
| SSD | ThinkPlus 联想 256GB NVMe SSD，M.2 2280，ST9000 系列 | 275 元           |
| 内存  | ~~光威 Gloway 8GB DDR4 3200 CL22~~               | 109 元，已退        |
| 内存  | 光威 Gloway 16GB DDR4 3200 CL22                  | 275 元           |
| U 盘 | 闪迪 SanDisk 64GB USB3.2，CZ550 黑色                | 10.91 元         |
| 网络  | 动态公网 IPv4                                      | 用于后续 DDNS 和公网访问 |
| 域名  | 若干域名                                           | 用于反向代理和服务访问     |
- 总目标
- [ ] 在小主机上安装 Debian SSH Server。
- [ ] 在局域网内通过 SSH 远程管理 Debian 主机。
- [ ] 在 Debian 上部署虚拟机、Docker 服务、DDNS、备份和同步服务
> 尽量保证服务可迁移、可备份、可恢复。
- 待办
	- [ ] 在小主机上安装Debian ssh server系统。在局域网内通过ssh连接管理。
		- [ ] 换源，添加docker代理。
		- [ ] 配置开机自启动，包括虚拟机和docker应用。
		- [ ] 自动关机脚本
		- [ ] 部署`DDNS`服务。
	- [ ] 最小化安装`kvm/qemu`虚拟机，
		- [ ] 在主力机Arch Linux上使用`virt-manager`通过ssh连接进行管理。
		- [ ] 配置网桥
		- [ ] 安装`ImmortalWRT`虚拟机
	- [ ] docker compose
		- [ ] `caddy-cloudflare`
		- [ ] `openlist`，并配置端口转发+公网域名反代。挂载本机存储`/home`目录、百度网盘、google drive。`openlist`用于代替飞牛的文件系统。
		- [ ] `MCSManager`，并配置端口转发+公网域名反代。
		- [ ] `gitea`，搭建私人局域网git仓库，并上传项目文件。
		- [ ] `restic+rclone`，将Arch Linux主力机的`/home`、`/etc`和导出的软件包列表等文件加密并备份到网盘上。
		- [ ] `couchDB`，作为obsidian笔记Sync服务的中转站，obsidian客户端上安装`Self-hosted LiveSync`插件，实现局域网中的所有设备的obsidian笔记同步。
