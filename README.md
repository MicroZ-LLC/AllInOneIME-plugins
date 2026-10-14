# AllInOneIME plugins

[English](#english) · [中文](#中文)

## English

The plugin library of [AllInOneIME](https://github.com/MicroZ-LLC/AllInOneIME), the macOS input method
where `@command text` runs commands. Plugins add commands not everyone needs, like `@stock AAPL 600519 700`.
In AllInOneIME, Settings → Plugins → "Browse Library" lists the plugins here; installing one shows the
websites it contacts, downloads its files and checks each against the signed index.

### Layout

```
plugins/<name>/<version>/   plugin.json and its files; never changed once published
index.json                  every plugin version, with each file's sha256
index.json.sig              Ed25519 signature (base64) of the exact bytes of index.json
scripts/build-index         validates the plugins, writes index.json and signs it
```

`index.json`:

```json
{ "schema": 1, "generated": "2026-10-10T12:00:00Z",
  "plugins": [{ "name": "stock", "version": "1.0.0", "api": 1, "minAppVersion": "0.2.0", "type": "script",
                "summary": {"en": "…", "zh": "…"}, "hosts": ["query1.finance.yahoo.com"],
                "author": "…", "homepage": "https://…", "icon": "chart.line.uptrend.xyaxis", "color": "green",
                "base": "plugins/stock/1.0.0/", "files": {"main.js": "<sha256>", "plugin.json": "<sha256>"} }] }
```

Every version is listed, newest first; the app installs the newest one it can run (`api`, `minAppVersion`).
`type` is `script` (JavaScript), `prompt` (an AI instruction) or `link` (opens a web address: the manifest
has `url` instead of `script`, and the index carries it).

### Why a signature

The app verifies `index.json.sig` with the public key built into it **before** it reads the index, then
installs a plugin only if every file matches its sha256. Hashes alone wouldn't be enough: whoever could push
here could change files and hashes together. The signing key never leaves the maintainer's Mac.

Public key (Ed25519, raw, base64):

```
UPEZUcV35+GKMGKuBUm+EG2M8jro4F23vyskaCLcBIE=
```

### Submitting a plugin

1. Write it (see [docs/plugins.md](https://github.com/MicroZ-LLC/AllInOneIME/blob/main/docs/plugins.md)) and
   try it in `~/.config/allinoneime/plugins/<name>/`, where AllInOneIME loads it as a local plugin.
2. Open a pull request adding `plugins/<name>/<version>/` with `plugin.json` and its files. Don't touch
   `index.json` or `index.json.sig`: the maintainer regenerates and signs them after merging.
3. An update is a new version folder (`plugins/<name>/1.1.0/`); published folders never change.

### Review rules

- `name`: 1–24 lowercase letters, the same as the folder; `version` the same as its folder (`1.0.0`).
- A `summary` in English (and Chinese if you can); `homepage` (if any) is https.
- `hosts`: the only sites a script may contact, HTTPS host names (no `https://`, path or port). Ask only for
  what the command needs; the user sees this list before installing.
- Scripts: at most 64 KB, plain readable JavaScript (not minified or obfuscated), no `eval(`, `Function(` or
  `new Function`. They get nothing but `fetch` to their hosts.
- Plain files only (no folders or links), names of letters, digits, `.`, `_`, `-`; at most 1 MB each.
- No tracking, no sending more than the text typed after the command, nothing a reader can't follow.
- CI (`.github/workflows/check.yml`) checks the mechanical rules; the maintainer reads every line.

### Signing (maintainer)

```sh
scripts/build-index            # validate, write index.json, sign it into index.json.sig
scripts/build-index --check    # what CI runs on main: index matches the plugins, signature valid
scripts/build-index --validate # what CI runs on pull requests: the plugins only
```

The private key is in the maintainer's login keychain (generic password, service
`allinoneime-plugins-signing`, account `weijianz-opc`, the raw key in base64); the script reads it with
`security find-generic-password` and refuses to sign if it doesn't match the public key above. Never put it in a
file in any repository. Commit `index.json` and `index.json.sig` together.

## 中文

[AllInOneIME](https://github.com/MicroZ-LLC/AllInOneIME)（macOS 输入法，`@命令 内容` 运行命令）的插件库。
插件是不是人人都要的 `@` 命令，比如 `@stock AAPL 600519 700` 查股价。
在 AllInOneIME 的设置 →「插件」→「浏览插件库」里能看到这里的插件；安装时会先告诉你它会访问哪些网站，
再下载文件，并逐个和签过名的索引核对。

### 结构

```
plugins/<名字>/<版本>/      plugin.json 和它的文件；发布后不再改动
index.json                  所有插件版本，以及每个文件的 sha256
index.json.sig              index.json 原始字节的 Ed25519 签名（base64）
scripts/build-index         检查插件、生成 index.json 并签名
```

每个版本都列出（新的在前）；App 安装它能运行的最新版本（看 `api` 和 `minAppVersion`）。
`type` 是 `script`（JavaScript）、`prompt`（AI 指令）或 `link`（打开网址：清单里用 `url` 代替 `script`，索引里也带上）。

### 为什么要签名

App **先**用内置的公钥验证 `index.json.sig`，通过了才读索引；每个文件的 sha256 都对上才安装。
只有哈希不够：能往这个仓库推送的人可以把文件和哈希一起改掉。签名私钥只在维护者的电脑上。

公钥（Ed25519，原始格式，base64）：

```
UPEZUcV35+GKMGKuBUm+EG2M8jro4F23vyskaCLcBIE=
```

### 提交插件

1. 按 [docs/plugins.md](https://github.com/MicroZ-LLC/AllInOneIME/blob/main/docs/plugins.md) 写好，放进
   `~/.config/allinoneime/plugins/<名字>/` 试用（AllInOneIME 会把它当作本地插件加载）。
2. 提一个 pull request，新增 `plugins/<名字>/<版本>/`（`plugin.json` 和它的文件）。不要改 `index.json`
   和 `index.json.sig`：合并后由维护者重新生成并签名。
3. 更新就是新的版本文件夹（`plugins/<名字>/1.1.0/`）；已发布的文件夹不再改动。

### 审核规则

- `name`：1–24 个小写字母，和文件夹同名；`version` 和版本文件夹同名（`1.0.0`）。
- 要有英文 `summary`（能写中文更好）；`homepage`（如有）用 https。
- `hosts`：脚本唯一能访问的网站，HTTPS 主机名（不带 `https://`、路径和端口）。只写命令需要的；用户安装前会看到这个列表。
- 脚本：不超过 64 KB，可读的 JavaScript（不压缩、不混淆），不能有 `eval(`、`Function(`、`new Function`。脚本只有 `fetch`，只能访问它的 hosts。
- 只能是普通文件（没有子文件夹和链接），文件名只用字母、数字、`.`、`_`、`-`；每个不超过 1 MB。
- 不跟踪用户，除了命令后面输入的内容不发送别的，代码要让人看得懂。
- CI（`.github/workflows/check.yml`）检查这些机械规则；维护者逐行审读。

### 签名（维护者）

```sh
scripts/build-index            # 检查、生成 index.json，并签名到 index.json.sig
scripts/build-index --check    # main 上的 CI：索引和插件一致、签名有效
scripts/build-index --validate # pull request 的 CI：只检查插件
```

私钥存在维护者的登录钥匙串里（通用密码，服务 `allinoneime-plugins-signing`，账户 `weijianz-opc`，内容是原始私钥的 base64）；
脚本用 `security find-generic-password` 读取，和上面的公钥不匹配时拒绝签名。不要把私钥放进任何仓库的文件里。
`index.json` 和 `index.json.sig` 要一起提交。

---

Copyright © 2026 MicroZ LLC. MIT; see [LICENSE](LICENSE). Each plugin may name its own author in its `plugin.json`.
