# AI 模型文件

此目录存放浏览器端 AI 推理所需的 ONNX 模型文件。

## 图片去水印工具（LaMa）

- **模型**: LaMa (Large Mask Inpainting with Fourier Convolutions)
- **格式**: ONNX (fp32)
- **来源**: [IsGarrido/LaMa-ONNX](https://huggingface.co/IsGarrido/LaMa-ONNX) (Apache-2.0)
- **国内镜像**: [hf-mirror.com](https://hf-mirror.com/IsGarrido/LaMa-ONNX)
- **文件名**: `lama_fp32.onnx`
- **文件大小**: ~208MB
- **输入**: `[1, 4, H, W]` — 图像 RGB + 二值 mask，归一化到 [-1, 1]
- **输出**: `[1, 3, H, W]` — 修复后的图像，归一化到 [-1, 1]

### 获取方式

1. 访问 [HuggingFace 模型页](https://huggingface.co/IsGarrido/LaMa-ONNX/tree/main)（国内用户可用 [hf-mirror.com 镜像](https://hf-mirror.com/IsGarrido/LaMa-ONNX/tree/main)）
2. 下载 `lama_fp32.onnx` 文件
3. 将文件放到 `public/models/lama_fp32.onnx`

### 加载说明

- 工具首次使用时会自动尝试从 `/models/lama_fp32.onnx` 加载
- 如果本地不存在，会尝试从 hf-mirror.com 镜像下载（国内可访问）
- 模型加载后由浏览器缓存，后续访问无需重复下载
- 模型约 208MB，首次加载需要良好的网络连接
