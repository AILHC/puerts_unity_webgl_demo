# Puerts WebGL demo
![puerts_webgl](https://img.shields.io/badge/preview-v1.0.0-blue.svg)

本项目包括了一个可以以WebGL模式构建运行Puerts的Unity项目。puerts的JS代码会运行在浏览器JS引擎里，而不是运行在编译为WASM的JS解释器里。

支持Unity 2019+

## Demos
* 简单旋转demo
* 篮球小游戏demo
* 和 xLua WebGL 进行fibonacci 性能对比测试demo

#### 如何跑起来
在build目录启动一个httpserver，通过网页访问即可看到4个demo的效果，它们是Unity2019编译产生的。

* 我想自己重新构建？
1. 打开Unity，在`puerts-webgl`菜单下点击install执行npm依赖的安装
2. 执行Unity的WebGL Build
3. 根据命令行提示，使用`puerts-webgl`里的构建功能生成为浏览器环境所用的js。
4. 如果是浏览器环境，修改生成好的html，在<head>中添加<script>，将刚刚生成的两个js加上去
```
  <script src="./puerts-runtime.js"></script>
  <script src="./puerts_browser_js_resources.js"></script>
```
  
* 怎么上微信小游戏？
1. 通过[微信提供的webgl转化项目](https://github.com/wechat-miniprogram/minigame-unity-webgl-transform)进行WebGL Build
2. 使用`puerts-webgl`里的构建功能生成为微信环境所用的js。
3. 在构建出来的小游戏`game.js`中，添加require('puerts-runtime.js')
4. iOS预览时请跟随[该指引](https://github.com/wechat-miniprogram/minigame-unity-webgl-transform/blob/main/Design/iOSOptimization.md)申请高性能模式
  
## Performance
因为在这套架构下，JS是运行在宿主JS环境下的，有JIT的支持，因此相比Lua脚本方案，在*执行性能*上有碾压性的性能优势。
|       | 10万次 fibonacci(12) |
| ---  |    ---    |
|xLua WebGL   |    6200ms    |
|本Puerts WebGL方案 |   165ms     |

## Dependent
因为大量使用到了`WeakRef`和`FinalizationRegistry`API。该功能在以下环境下可用：
1. V8 8.4+ (eg. Chrome 84+) 或是打开`--harmony-weak-refs`的v8 7.4+
2. iOS Safari 14.5+/OSX Safari 14.1+
3. 微信小游戏环境（iOS下需要申请高性能模式）

## How to contrib
* 运作原理(how this work?)

Puerts的WebGL版本是利用Unity官方提供的[Unity代码与浏览器脚本交互的功能](https://docs.unity3d.com/2018.4/Documentation/Manual/webgl-interactingwithbrowserscripting.html)，对Puerts中使用到的`PuertsDLL.cs`里的API通过JS一一进行实现。关键代码位于`Assets/Plugins/puerts.jslib`以及`puerts-webgl/PuertsDLLMock`。

* 未来还有以下工作要做(TODO)：

1. 测试2021下bigint表现

## 已上线游戏
| 作者 | 码 |
| --- | --- |
| [zgz682000](https://github.com/zgz682000) | <img src="./doc/pic/game1.jpg" alt="Game1" width="100" height="100"/> |
| [ctxdegithub](https://github.com/ctxdegithub) | <img src="./doc/pic/game2.jpg" alt="Game2" width="100" height="100"/> |
