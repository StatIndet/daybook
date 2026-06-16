---
title: clavis-shell编译安装方法（临时版）
date: 2026-06-16
slug: clavis-shell
tags:
  - quickshell
  - clavis
summary: 我自制的desktop-shell手动克隆安装方法，仅用于临时测试。
draft: false
---
>当前项目远未完工，不要在主力机上使用。
>当前项目仅适配了niri。

先`cd ~/.config`目录然后`git clone https://github.com/StatIndet/quickshell.git`，将quickshell配置克隆下来。
- 安装cava库包
```
paru -S lib-cava
```
- 安装qt6-lottie
```
sudo pacman -S qt6-lottie
```
- 安装天气图标
```
sudo pacman -S nodejs npm
```

```
mkdir -p weatehricons
cd weathericons
npm install @meteocons/lottie
```
将下载好的lottie天气图标放到quickshell配置目录下。
```
mkdir -p ~/.config/quickshell/assets/icons/weather/meteocons/
```

```
cp -r node_modules/@meteocons/lottie/ ~/.config/quickshell/assets/icons/weather/meteocons 
```

- `cd ~/.config/quickshell`进入项目目录，编译：
```
cmake -S core -B core/build
```

```
cmake --build core/build
```
将编译好的构件产物复制到qml插件目录：
```
sudo cp -r core/build/Clavis /usr/lib64/qt6/qml/
```
最后终端`qs`运行即可。

- quickshell ipc
```
quickshell ipc call lockopen    //打开锁屏
quickshell ipc call island hub  //打开灵动岛hub栏
quickshell ipc call launcher toggle  //打开启动器
quickshell ipc call island tools  //打开灵动岛工具栏，但是工具栏尚未完工，不要使用。
```

>目前右上角的电源菜单依赖wlogout，未来会被移除。现在的电源菜单仅是一个占位符。