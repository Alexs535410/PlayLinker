using QuestPDF.Drawing;

namespace PlayLinker.Services;

internal static class ReportPdfFonts
{
    private static bool _registered;
    private static readonly object Lock = new();

    public const string ChineseFontFamily = "Noto Sans SC";

    public static void EnsureRegistered(ILogger? logger = null)
    {
        if (_registered) return;

        lock (Lock)
        {
            if (_registered) return;

            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "Fonts", "NotoSansSC-Regular.woff"),
                Path.Combine(AppContext.BaseDirectory, "Fonts", "NotoSansSC-Regular.otf"),
                Path.Combine(AppContext.BaseDirectory, "Fonts", "NotoSansSC-Regular.ttf"),
            };

            foreach (var path in candidates)
            {
                if (!File.Exists(path)) continue;

                using var stream = File.OpenRead(path);
                FontManager.RegisterFont(stream);
                _registered = true;
                logger?.LogInformation("PDF 中文字体已加载: {Path}", path);
                return;
            }

            logger?.LogWarning("未找到 PDF 中文字体文件，中文可能无法正常显示");
            _registered = true;
        }
    }
}
