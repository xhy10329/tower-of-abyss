# 部署指南 — 把《深渊之塔》发布到固定网址

本指南教你把游戏部署到 **GitHub Pages**，得到一个永久网址。
以后更新游戏，只要替换文件，链接不变，玩家刷新即玩最新版。

**全程不需要命令行**，都在网页上点击完成。

---

## 准备：项目文件结构

你的 `tower-of-abyss` 文件夹应该长这样：

```
tower-of-abyss/
├── index.html          ← 入口文件（GitHub Pages 自动找它）
├── styles.css
├── js/
│   ├── data.js
│   ├── game.js
│   ├── save.js
│   ├── audio.js
│   └── main.js
└── assets/
    └── audio/          ← 音频文件（可选）
        └── README.md
```

---

## 第一步：注册 / 登录 GitHub

1. 打开 https://github.com
2. 没有账号就点 **Sign up** 注册（免费），有账号直接 **Sign in**

---

## 第二步：新建仓库（Repository）

1. 登录后，点右上角的 **+** → **New repository**
2. **Repository name** 填一个名字，比如 `tower-of-abyss`
3. 选择 **Public**（GitHub Pages 免费版需要公开仓库）
4. **不要**勾选 "Add a README"（保持空仓库）
5. 点 **Create repository**

---

## 第三步：上传游戏文件

1. 在新仓库页面，点 **uploading an existing file**
   （或者 **Add file** → **Upload files**）
2. 把 `tower-of-abyss` 文件夹里的**所有内容**拖进上传区
   - ⚠️ 注意：拖**文件夹里面的东西**（index.html、styles.css、js 文件夹、assets 文件夹），
     而不是拖整个 `tower-of-abyss` 文件夹本身
   - GitHub 会保留 `js/` 和 `assets/` 的子文件夹结构
3. 等文件上传完，下方点 **Commit changes**

> 如果拖拽不保留文件夹结构，可以分两次传：先传 index.html 和 styles.css，
> 再用 **Add file → Create new file**，在文件名里输入 `js/data.js` 这样的路径，
> GitHub 会自动建子文件夹。不过现代浏览器拖整个文件夹通常没问题。

---

## 第四步：开启 GitHub Pages

1. 在仓库页面，点上方的 **Settings**（设置）
2. 左侧菜单找到 **Pages**
3. **Source** 选择 **Deploy from a branch**
4. **Branch** 选择 **main**，文件夹保持 **/ (root)**，点 **Save**
5. 等 1–2 分钟，刷新这个页面，顶部会出现：

   ```
   Your site is live at https://你的用户名.github.io/tower-of-abyss/
   ```

这个网址就是你的永久游戏链接！分享给任何人都能玩。

---

## 以后怎么更新游戏？

链接永远不变，更新只需替换文件：

1. 进入仓库，点开要改的文件（比如 `js/data.js`）
2. 点右上角的**铅笔图标**（Edit）直接在网页上改
3. 或者用 **Add file → Upload files** 上传新版本覆盖
4. 点 **Commit changes**
5. 等 1 分钟，玩家刷新链接就是新版本

> 注意：浏览器有缓存。更新后如果看不到变化，让玩家按 **Ctrl+Shift+R**（Mac 是 Cmd+Shift+R）强制刷新。

---

## 常见问题

**Q：打开链接是 404 / 空白页？**
- 确认入口文件叫 `index.html`（全小写）且在仓库根目录
- 确认 Pages 的 Branch 选了 `main` 和 `/ (root)`
- 刚开启 Pages 需要等几分钟才生效

**Q：游戏能打开但样式乱了 / 卡牌点不动？**
- 多半是文件路径问题。确认 `js/` 文件夹和里面 5 个 .js 文件都传上去了
- 在浏览器按 **F12** 打开控制台，看有没有红色报错（比如 `404 js/data.js`），
  报错会告诉你哪个文件没找到

**Q：存档会丢吗？**
- 存档保存在玩家自己浏览器的 localStorage 里，不在服务器上
- 同一浏览器、同一设备能继续；换设备或清缓存会丢失。这对单机小游戏是正常的

**Q：想加音乐？**
- 把音频文件按 `assets/audio/README.md` 里的文件名放进 `assets/audio/`，
  再上传到仓库即可。没有音频文件游戏照常运行

---

## 备选方案：Netlify（拖拽更简单）

如果你觉得 GitHub 麻烦，**Netlify** 支持直接拖文件夹：

1. 打开 https://app.netlify.com（用 GitHub 账号登录）
2. 把整个 `tower-of-abyss` 文件夹拖到页面的部署区
3. 几秒后得到一个网址，更新时重新拖一次即可

缺点：免费版网址是随机字符串（可在设置里改成自定义名字）。
GitHub Pages 的网址更规整、更适合长期使用。两者都免费。
