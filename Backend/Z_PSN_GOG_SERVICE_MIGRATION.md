# PsnService和GogService快速修改指南

## PsnService修改要点

在`Backend/Services/PsnService.cs`文件的构造函数中添加：

```csharp
private readonly ITokenEncryptionService _encryptionService;
private readonly PlayLinkerDbContext _context;

public PsnService(
    IConfiguration configuration, 
    ILogger<PsnService> logger, 
    IWebHostEnvironment environment,
    ITokenEncryptionService encryptionService,  // 新增
    PlayLinkerDbContext context)                // 新增
{
    _configuration = configuration;
    _logger = logger;
    _encryptionService = encryptionService;  // 新增
    _context = context;                       // 新增
    // ... 其他初始化代码
}
```

添加using语句（文件顶部）：
```csharp
using PlayLinker.Data;
using Microsoft.EntityFrameworkCore;
```

添加三个辅助方法（参照XboxService）：
```csharp
private async Task<string?> LoadTokenFromDatabase(int userId, int platformId)
{
    try
    {
        var binding = await _context.UserPlatformBindings
            .FirstOrDefaultAsync(b => b.UserId == userId && b.PlatformId == platformId && b.BindingStatus == true);
        
        if (binding == null || string.IsNullOrEmpty(binding.AccessToken))
        {
            _logger.LogWarning("用户{UserId}未绑定平台{PlatformId}或令牌为空", userId, platformId);
            return null;
        }
        
        var decryptedToken = _encryptionService.DecryptToken(binding.AccessToken);
        var tempFilePath = Path.Combine(_tokensPath, $"psn_tokens_{userId}_{Guid.NewGuid():N}.json");
        await File.WriteAllTextAsync(tempFilePath, decryptedToken);
        
        _logger.LogInformation("令牌已从数据库加载到临时文件: {TempFile}", tempFilePath);
        return tempFilePath;
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "从数据库加载令牌失败");
        return null;
    }
}

private async Task<bool> SaveTokenToDatabase(int userId, int platformId, string tokenJson)
{
    try
    {
        var binding = await _context.UserPlatformBindings
            .FirstOrDefaultAsync(b => b.UserId == userId && b.PlatformId == platformId);
        
        if (binding != null)
        {
            var encryptedToken = _encryptionService.EncryptToken(tokenJson);
            binding.AccessToken = encryptedToken;
            binding.LastSyncTime = DateTime.UtcNow;
            binding.ExpireTime = DateTime.UtcNow.AddYears(1);
            await _context.SaveChangesAsync();
            
            _logger.LogInformation("令牌已保存到数据库: UserId={UserId}, PlatformId={PlatformId}", userId, platformId);
            return true;
        }
        
        _logger.LogWarning("未找到绑定记录: UserId={UserId}, PlatformId={PlatformId}", userId, platformId);
        return false;
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "保存令牌到数据库失败");
        return false;
    }
}

private void CleanupTempTokenFile(string? tempFilePath)
{
    try
    {
        if (!string.IsNullOrEmpty(tempFilePath) && File.Exists(tempFilePath))
        {
            File.Delete(tempFilePath);
            _logger.LogInformation("临时令牌文件已删除: {TempFile}", tempFilePath);
        }
    }
    catch (Exception ex)
    {
        _logger.LogWarning(ex, "删除临时令牌文件失败: {TempFile}", tempFilePath);
    }
}
```

修改`GetPsnDataFromNode`方法：
```csharp
private async Task<JsonDocument?> GetPsnDataFromNode(int userId, int platformId = 6)
{
    string? tempFilePath = null;
    try
    {
        tempFilePath = await LoadTokenFromDatabase(userId, platformId);
        if (tempFilePath == null)
        {
            _logger.LogWarning("无法加载用户{UserId}的令牌", userId);
            return null;
        }

        var arguments = $"--tokens \"{tempFilePath}\"";
        var (exitCode, output, error) = await RunNodeScript("psn_get_data.js", arguments);
        
        // ... 解析逻辑保持不变 ...
        
        // 成功后保存更新的令牌
        if (File.Exists(tempFilePath))
        {
            var updatedToken = await File.ReadAllTextAsync(tempFilePath);
            await SaveTokenToDatabase(userId, platformId, updatedToken);
        }
        
        return doc; // 返回解析后的文档
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "获取PSN数据时发生错误");
        return null;
    }
    finally
    {
        CleanupTempTokenFile(tempFilePath);
    }
}
```

然后将所有公共方法的签名从：
- `ImportPsnData(PsnImportRequestDto request)` 改为 `ImportPsnData(PsnImportRequestDto request, int userId)`
- `GetPsnUser(string onlineId)` 改为 `GetPsnUser(string onlineId, int userId)`
- `GetPsnGame(string titleId)` 改为 `GetPsnGame(string titleId, int userId)`
- `GetPsnUserTrophies(string onlineId)` 改为 `GetPsnUserTrophies(string onlineId, int userId)`
- `GetPsnUserGames(string onlineId)` 改为 `GetPsnUserGames(string onlineId, int userId)`
- `AuthenticatePsn(PsnAuthRequestDto request)` 改为 `AuthenticatePsn(PsnAuthRequestDto request, int userId)`
- `CheckTokenStatus(string? tokensPath = null)` 改为 `CheckTokenStatus(int userId, int platformId = 6)`

将所有方法内部的 `GetPsnDataFromNode()` 调用改为 `GetPsnDataFromNode(userId, 6)`

## GogService修改要点

完全参照PsnService的修改方式，但注意：
- 平台ID为5（GOG）
- 临时文件名前缀为 `gog_tokens_`
- Node脚本名称使用 `RunPythonScript` (GOG使用Python)
- 方法名为 `GetGogDataFromPython`

## 提示

如果短时间内无法完成Service的修改，可以暂时让Service方法抛出NotImplementedException：

```csharp
public async Task<PsnUserDto?> GetPsnUser(string onlineId, int userId)
{
    throw new NotImplementedException("PSN服务正在迁移中，请稍后使用");
}
```

这样至少代码能编译通过，控制器能正确调用接口喵姆~

