# 海岬号 · Vector Flight

从海岬号甲板滑跑或垂直起飞，沿海岛飞行，再返回甲板。塔台和飞行员会在滑行、离舰、进近和接地时自动通话。游戏支持键盘、鼠标和触屏。

[在线试玩](https://will-xgq.github.io/vector-flight/) · [下载离线版](https://github.com/will-xgq/vector-flight/raw/refs/heads/main/dist/index.html)

## 开始飞行

用支持 WebGL 的浏览器打开游戏。离线版是一个 HTML 文件，内含模型、贴图、天空和塔台语音，下载后双击即可游玩。

| 操作 | 按键 |
| --- | --- |
| 启动发动机，调节油门，制动 | E，W / S，B |
| 在甲板上滑跑起飞或垂直起飞 | 空格或 V |
| 在空中切换悬停和平飞 | V |
| 自动返舰着陆 | L |
| 查看塔台记录或主动呼叫 | Y |
| 查看完整操作指南 | H |

## 本地构建

在仓库根目录用 Python 3 运行构建脚本，只需标准库。

```sh
python3 build.py
```

构建结果位于 `dist/index.html`。游戏代码在 `src/`，离线资源在 `vendor/`。

## 素材署名

渲染使用 Three.js，界面字体为 Barlow Condensed，天空和地表纹理来自 Poly Haven。[Three.js 许可](vendor/three.LICENSE) · [字体许可](vendor/BarlowCondensed.OFL) · [天空摄影](vendor/sky.LICENSE) · [地表和树木素材](vendor/terrain.LICENSE)
