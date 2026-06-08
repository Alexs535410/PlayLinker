# PlayLinker 令牌存储迁移指南

## 概述

本指南说明如何将 Steam API Key、Xbox/PSN/GOG 令牌从本地文件存储迁移到数据库存储，以支持多用户并发使用。

## 已完成的工作

✅ 1. 创建了令牌加密服务 (`ITokenEncryptionService` 和 `TokenEncryptionService`)
✅ 2. 修改了 `SteamService` 支持从参数传入 API Key
✅ 3. 更新了 `ISteamService` 接口，所有方法需要 `apiKey` 参数
✅ 4. 修改了 `XboxService` 添加数据库令牌加载/保存方法
✅ 5. 更新了 `IXboxService` 接口，添加 `userId` 参数
✅ 6. 在 `Program.cs` 中注册了 `ITokenEncryptionService`
✅ 7. 更新了 `appsettings.json`，移除硬编码的 Steam API Key

## 需要继续完成的工作

### 第一部分：完成 XboxService 修改

需要更新 `Backend/Services/XboxService.cs` 中所有调用 `GetXboxDataFromPython` 的方法：

#### 1. 修改 `GetXboxUser` 方法

```csharp
// 当前签名
public async Task<XboxUserDto?> GetXboxUser(string xuid)

// 需要修改为
public async Task<XboxUserDto?> GetXboxUser(string xuid, int userId)
{
    // ...
    var xboxData = await GetXboxDataFromPython(userId, 7); // 7 = Xbox平台ID
    // ...
}
```

#### 2. 修改 `GetXboxGame` 方法

```csharp
public async Task<XboxGameDto?> GetXboxGame(string titleId, int userId)
{
    var xboxData = await GetXboxDataFromPython(userId, 7);
    // ...
}
```

#### 3. 修改 `GetXboxUserAchievements` 方法

```csharp
public async Task<List<XboxUserAchievementDto>> GetXboxUserAchievements(string xuid, int userId)
{
    var xboxData = await GetXboxDataFromPython(userId, 7);
    // ...
}
```

#### 4. 修改 `GetXboxUserGames` 方法

```csharp
public async Task<List<XboxGameDto>> GetXboxUserGames(string xuid, int userId)
{
    var xboxData = await GetXboxDataFromPython(userId, 7);
    // ...
}
```

#### 5. 修改 `ImportXboxData` 方法

```csharp
public async Task<XboxImportResponseDto> ImportXboxData(XboxImportRequestDto request, int userId)
{
    var xboxData = await GetXboxDataFromPython(userId, 7);
    // ...
}
```

#### 6. 修改 `AuthenticateXbox` 方法

这个方法需要特殊处理，因为它是首次认证，需要：
1. 执行认证脚本生成令牌文件
2. 读取生成的令牌文件内容
3. 将令牌保存到数据库的 `user_platform_binding` 表
4. 删除临时令牌文件

```csharp
public async Task<XboxAuthResponseDto> AuthenticateXbox(XboxAuthRequestDto request, int userId)
{
    // ... 执行认证脚本 ...
    
    // 认证成功后，读取令牌文件
    if (File.Exists(tokenPath))
    {
        var tokenJson = await File.ReadAllTextAsync(tokenPath);
        
        // 保存到数据库
        await SaveTokenToDatabase(userId, 7, tokenJson);
        
        // 删除临时文件
        CleanupTempTokenFile(tokenPath);
    }
    
    // ...
}
```

### 第二部分：修改 PsnService

完全参照 XboxService 的模式修改 `Backend/Services/PsnService.cs`：

1. 添加 `_encryptionService` 和 `_context` 依赖注入
2. 添加 `LoadTokenFromDatabase`, `SaveTokenToDatabase`, `CleanupTempTokenFile` 方法
3. 修改 `GetPsnDataFromNode` 支持 `userId` 参数
4. 更新所有公共方法签名添加 `userId` 参数

### 第三部分：修改 GogService

完全参照 XboxService 的模式修改 `Backend/Services/GogService.cs`：

1. 添加 `_encryptionService` 和 `_context` 依赖注入
2. 添加 `LoadTokenFromDatabase`, `SaveTokenToDatabase`, `CleanupTempTokenFile` 方法  
3. 修改 `GetGogDataFromPython` 支持 `userId` 参数
4. 更新所有公共方法签名添加 `userId` 参数

### 第四部分：修改控制器

所有控制器需要从 JWT Token 中提取 `userId`，并传递给服务层。

#### SteamController 修改示例

```csharp
[HttpPost("import")]
public async Task<ActionResult<ApiResponse<SteamImportResponseDto>>> ImportData([FromBody] SteamImportRequestDto request)
{
    // 从JWT Token获取userId
    var userIdClaim = User.FindFirst("user_id");
    if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
    {
        return Unauthorized(ApiResponse<object>.ErrorResponse("ERR_UNAUTHORIZED", "用户未认证"));
    }
    
    // 从数据库获取用户的Steam API Key
    var binding = await _context.UserPlatformBindings
        .FirstOrDefaultAsync(b => b.UserId == userId && b.PlatformId == 1 && b.BindingStatus == true);
    
    if (binding == null || string.IsNullOrEmpty(binding.AccessToken))
    {
        return BadRequest(ApiResponse<object>.ErrorResponse("ERR_NO_API_KEY", "用户未绑定Steam平台或API Key不存在"));
    }
    
    // 解密API Key
    var apiKey = _encryptionService.DecryptToken(binding.AccessToken);
    
    // 调用服务
    var result = await _steamService.ImportSteamData(request, apiKey);
    
    return Ok(ApiResponse<SteamImportResponseDto>.SuccessResponse(result));
}
```

#### XboxController 修改示例

```csharp
[HttpGet("user/{xuid}")]
public async Task<ActionResult<ApiResponse<XboxUserDto>>> GetXboxUser(string xuid)
{
    // 从JWT Token获取userId
    var userIdClaim = User.FindFirst("user_id");
    if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
    {
        return Unauthorized(ApiResponse<object>.ErrorResponse("ERR_UNAUTHORIZED", "用户未认证"));
    }
    
    // 调用服务（服务内部会从数据库加载令牌）
    var result = await _xboxService.GetXboxUser(xuid, userId);
    
    if (result == null)
    {
        return NotFound(ApiResponse<object>.ErrorResponse("ERR_USER_NOT_FOUND", "Xbox用户不存在"));
    }
    
    return Ok(ApiResponse<XboxUserDto>.SuccessResponse(result));
}
```

### 第五部分：用户绑定平台API

需要添加新的 API 让用户绑定平台并保存 API Key/令牌。

#### Steam 平台绑定 API

```csharp
[HttpPost("steam/bind")]
public async Task<ActionResult<ApiResponse<object>>> BindSteamPlatform([FromBody] BindSteamRequestDto request)
{
    var userIdClaim = User.FindFirst("user_id");
    if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
    {
        return Unauthorized();
    }
    
    // 验证Steam API Key是否有效
    var testUser = await _steamService.GetSteamUser(request.SteamId, request.ApiKey);
    if (testUser == null)
    {
        return BadRequest(ApiResponse<object>.ErrorResponse("ERR_INVALID_API_KEY", "Steam API Key 无效"));
    }
    
    // 加密API Key
    var encryptedApiKey = _encryptionService.EncryptToken(request.ApiKey);
    
    // 保存或更新绑定
    var binding = await _context.UserPlatformBindings
        .FirstOrDefaultAsync(b => b.UserId == userId && b.PlatformId == 1);
    
    if (binding == null)
    {
        binding = new UserPlatformBinding
        {
            UserId = userId,
            PlatformId = 1,
            PlatformUserId = request.SteamId,
            AccessToken = encryptedApiKey,
            BindingStatus = true,
            BindingTime = DateTime.UtcNow,
            ExpireTime = DateTime.UtcNow.AddYears(10) // Steam API Key 长期有效
        };
        _context.UserPlatformBindings.Add(binding);
    }
    else
    {
        binding.PlatformUserId = request.SteamId;
        binding.AccessToken = encryptedApiKey;
        binding.BindingStatus = true;
        binding.LastSyncTime = DateTime.UtcNow;
    }
    
    await _context.SaveChangesAsync();
    
    return Ok(ApiResponse<object>.SuccessResponse(new { message = "Steam平台绑定成功" }));
}
```

#### DTO 定义

```csharp
public class BindSteamRequestDto
{
    public string SteamId { get; set; } = null!;
    public string ApiKey { get; set; } = null!;
}
```

### 第六部分：数据库字段长度调整

确保 `user_platform_binding` 表的字段可以存储足够长的令牌：

```sql
ALTER TABLE user_platform_binding 
MODIFY COLUMN platform_user_id TEXT COMMENT '第三方平台用户ID';

ALTER TABLE user_platform_binding 
MODIFY COLUMN access_token TEXT COMMENT 'AES-256加密存储的完整令牌或API Key';

ALTER TABLE user_platform_binding 
MODIFY COLUMN refresh_token TEXT COMMENT 'AES-256加密存储（如果需要）';
```

## 测试步骤

1. **测试 Steam 绑定**
   ```bash
   POST /api/v1/steam/bind
   {
     "steamId": "76561198000000000",
     "apiKey": "YOUR_STEAM_API_KEY"
   }
   ```

2. **测试 Steam 数据导入**
   ```bash
   POST /api/v1/steam/import
   {
     "steamId": "76561198000000000",
     "importGames": true
   }
   ```

3. **测试 Xbox 认证**
   ```bash
   POST /api/v1/xbox/authenticate
   {
     "openBrowser": true
   }
   ```

4. **测试 Xbox 数据获取**
   ```bash
   GET /api/v1/xbox/user/{xuid}
   ```

## 注意事项

1. **JWT Token 必需**：所有API都需要在请求头中携带有效的JWT Token
2. **平台ID常量**：
   - Steam: 1
   - Xbox: 7
   - PSN: 6
   - GOG: 5
3. **加密密钥**：使用 `JwtSettings:SecretKey` 作为加密密钥
4. **临时文件清理**：确保所有操作后清理临时令牌文件
5. **错误处理**：添加完善的错误处理和日志记录

## 需要修改的文件列表

### 服务层（Services）
- [x] `ITokenEncryptionService.cs` (已创建)
- [x] `TokenEncryptionService.cs` (已创建)
- [x] `ISteamService.cs` (已修改)
- [x] `SteamService.cs` (已修改)
- [x] `IXboxService.cs` (已修改)
- [ ] `XboxService.cs` (部分完成，需继续)
- [ ] `IPsnService.cs` (需修改)
- [ ] `PsnService.cs` (需修改)
- [ ] `IGogService.cs` (需修改)
- [ ] `GogService.cs` (需修改)

### 控制器层（Controllers）
- [ ] `SteamController.cs` (需修改所有方法)
- [ ] `XboxController.cs` (需修改所有方法)
- [ ] `PsnController.cs` (需修改所有方法)
- [ ] `GogController.cs` (需修改所有方法)
- [ ] `PlatformsController.cs` (需添加平台绑定API)

### 配置和启动
- [x] `Program.cs` (已注册新服务)
- [x] `appsettings.json` (已移除硬编码)

### 数据库
- [ ] 执行字段长度调整SQL脚本

## 迁移完成后的优势

1. ✅ **多用户支持**：每个用户独立存储令牌，互不干扰
2. ✅ **安全性提升**：令牌使用AES-256加密存储
3. ✅ **集中管理**：所有令牌集中在数据库，便于备份和迁移
4. ✅ **可扩展性**：易于添加新平台支持
5. ✅ **云部署友好**：不依赖本地文件系统

## 参考资料

- [ASP.NET Core 依赖注入](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection)
- [Entity Framework Core](https://learn.microsoft.com/en-us/ef/core/)
- [AES加密最佳实践](https://docs.microsoft.com/en-us/dotnet/standard/security/encrypting-data)

