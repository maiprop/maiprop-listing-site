# Changelog

## 1.0.0 (2026-10-23)


### Features

* **billing:** complete stripe integration ([0a76cd6](https://github.com/maiprop/maiprop-listing-site/commit/0a76cd6f8c06372f53699fd4db655bbf1969976b))
* **db:** admit selected automatic email operations ([1ce9e82](https://github.com/maiprop/maiprop-listing-site/commit/1ce9e82177f4150348c73202aa3cceec0366b17f))
* **db:** trace scheduled HTTP dispatches ([2008680](https://github.com/maiprop/maiprop-listing-site/commit/2008680b9af24ee21ab1003927256669d08bd342))
* **edge:** trace scheduled HTTP dispatch outcomes ([61d9a64](https://github.com/maiprop/maiprop-listing-site/commit/61d9a641f53d61e72701efb8d52b204e81db5172))
* **email:** admit selected automatic sends ([8553a94](https://github.com/maiprop/maiprop-listing-site/commit/8553a94bed4b50ad367e93ddced8412ae37cba16))
* harden phase 1-8 mutation boundaries ([02b0fd1](https://github.com/maiprop/maiprop-listing-site/commit/02b0fd16b1c14ae2fed95b97f1e65291286bc223))
* move new-build creation behind edge boundary ([#397](https://github.com/maiprop/maiprop-listing-site/issues/397)) ([008b65a](https://github.com/maiprop/maiprop-listing-site/commit/008b65aa38c28332024ead48230d50d3c3eccd0b))
* **release:** add bounded advisor index release path ([7978c31](https://github.com/maiprop/maiprop-listing-site/commit/7978c317c5c49e6f62ff66d3d12cb3ea8177f655))
* route project writes through edge boundary ([f8092d0](https://github.com/maiprop/maiprop-listing-site/commit/f8092d02357ce8481670f33cd04d571264578e4d))


### Bug Fixes

* accelerate initial listing catalogue paint ([#519](https://github.com/maiprop/maiprop-listing-site/issues/519)) ([1666a39](https://github.com/maiprop/maiprop-listing-site/commit/1666a392d9cbd305502ad3cb64b7435f716abad4))
* accept direct upload Pages posture ([772d2e7](https://github.com/maiprop/maiprop-listing-site/commit/772d2e7d053760220e70321cf44df99ede2b74a5))
* accept protected Supabase readiness ([5ac2030](https://github.com/maiprop/maiprop-listing-site/commit/5ac20309724ebed63637f5f143d8d68bfe3496e5))
* add gated role switch compatibility bridge ([5b368e9](https://github.com/maiprop/maiprop-listing-site/commit/5b368e958b7faea72b1b898e9973bc68e3881f6e))
* **admin:** keep proof-of-funds state truthful ([5baef69](https://github.com/maiprop/maiprop-listing-site/commit/5baef6959b0a1c195d1fa89df210dd2d3fc2c051))
* **admin:** use explicit proof load error state ([bb36233](https://github.com/maiprop/maiprop-listing-site/commit/bb36233b19d4e7cdaef3a1a0abdd18e62d85718b))
* align invitation approval notice with subscription status ([4cbd031](https://github.com/maiprop/maiprop-listing-site/commit/4cbd031d0a624dce2eda70e714b7eb24c83a3b71))
* align production types and dependency floors ([#559](https://github.com/maiprop/maiprop-listing-site/issues/559)) ([db53d1b](https://github.com/maiprop/maiprop-listing-site/commit/db53d1b9adae41edae93fbeb3e612b42dd8fec0b))
* align professional RPC strings with HTTP Unicode contract ([da048db](https://github.com/maiprop/maiprop-listing-site/commit/da048db9f2465858ec21048fd941e326a13eafd4))
* allow empty spotlight deployments ([#525](https://github.com/maiprop/maiprop-listing-site/issues/525)) ([1adbb46](https://github.com/maiprop/maiprop-listing-site/commit/1adbb460c76bea99fbf4e8006d752e9b8ee811d2))
* **auctions:** resolve entitlement identity and limit lookups concurrently ([#684](https://github.com/maiprop/maiprop-listing-site/issues/684)) ([fa1bdf6](https://github.com/maiprop/maiprop-listing-site/commit/fa1bdf6c3e8b4e6bcd2bc3dfc4c652e0d4373bb9))
* **auctions:** rotate public catalogue cache key past wedged page-1 entry ([#681](https://github.com/maiprop/maiprop-listing-site/issues/681)) ([56068a6](https://github.com/maiprop/maiprop-listing-site/commit/56068a607da772d6e6969539e9ada9aaffd26af7))
* **auth:** admit signed email hook slots durably ([4fbc313](https://github.com/maiprop/maiprop-listing-site/commit/4fbc313d127d0d90e407da2114b25b3f8cecbfd6))
* authenticate hotfix main verification ([0996465](https://github.com/maiprop/maiprop-listing-site/commit/0996465a7691d603e95256bb2f008d3a5b1d8d70))
* authorize auctions without production service role ([2a38d70](https://github.com/maiprop/maiprop-listing-site/commit/2a38d70d2abdf472aa5774e3b3e89d0363358897))
* avoid deep Stripe invoice expansions ([#491](https://github.com/maiprop/maiprop-listing-site/issues/491)) ([ee3cec8](https://github.com/maiprop/maiprop-listing-site/commit/ee3cec8b0a40407fb7977e0f63efb857eec62ebb))
* await checkout auth and drain staging route handlers ([#657](https://github.com/maiprop/maiprop-listing-site/issues/657)) ([e4ab705](https://github.com/maiprop/maiprop-listing-site/commit/e4ab7057a9a67174a3ccbda3a15fd7042dab4c1e))
* await return auth and drain staging route handlers ([e4ab705](https://github.com/maiprop/maiprop-listing-site/commit/e4ab7057a9a67174a3ccbda3a15fd7042dab4c1e))
* **billing:** bind professional tier to customer actor ([a88b16e](https://github.com/maiprop/maiprop-listing-site/commit/a88b16eb44d088aa27d2ef05c3bffb07be4d2b4b))
* **billing:** preserve invoice credit request encoding ([922fc9e](https://github.com/maiprop/maiprop-listing-site/commit/922fc9ea1b26ece478035ad16982bf88e3b340f0))
* **billing:** recover uncertain trial checkout operations ([5e47c50](https://github.com/maiprop/maiprop-listing-site/commit/5e47c504b412cad48a3a050cdf412876585d9204))
* **billing:** retry failed subscription entitlement writes ([ca1b23e](https://github.com/maiprop/maiprop-listing-site/commit/ca1b23e83107447c8b1b724d6ec9305393f50c51))
* bind checkout lifecycle state ([179ab64](https://github.com/maiprop/maiprop-listing-site/commit/179ab644b3f7ccb834187b86ee9a7a0f41df1efd))
* bind Stripe checkout reconciliation ([47b54b0](https://github.com/maiprop/maiprop-listing-site/commit/47b54b0bf1619b7a25f2dee64866c93620efc480))
* bind Stripe runtime modes in release ([3bf1de0](https://github.com/maiprop/maiprop-listing-site/commit/3bf1de06521e708bb9220d531e6b769695a061cb))
* bound listings location passive search fallback ([#497](https://github.com/maiprop/maiprop-listing-site/issues/497)) ([090eb37](https://github.com/maiprop/maiprop-listing-site/commit/090eb379b870a6b7a2c45bd258d1a599ce8e789a))
* bound temporary database login readiness ([#599](https://github.com/maiprop/maiprop-listing-site/issues/599)) ([7a4c240](https://github.com/maiprop/maiprop-listing-site/commit/7a4c240f90ea81d7d6f61737c2358d724a087db4))
* broaden locality address search radius ([cb83aa9](https://github.com/maiprop/maiprop-listing-site/commit/cb83aa9f39527516eb93785b92eaa722c6f3e9c0))
* bypass auction cache for authenticated requests ([874cd39](https://github.com/maiprop/maiprop-listing-site/commit/874cd39ac3f1462f3252143dce34161cf225ed13))
* canonicalize catalogue hotfix database identity URLs ([#598](https://github.com/maiprop/maiprop-listing-site/issues/598)) ([465f547](https://github.com/maiprop/maiprop-listing-site/commit/465f547cce48819d81e11efbab7ee8b082515a30))
* canonicalize OH event UUID before admission ([7146947](https://github.com/maiprop/maiprop-listing-site/commit/71469470fe541c8d7c305ea1398bd618e587442e))
* **ci:** disable Deno colors in coverage contracts step ([8e4d79d](https://github.com/maiprop/maiprop-listing-site/commit/8e4d79d4d4b1f64a4e1c8ae44617c38cb5aa8990))
* **ci:** export MAIPROP_DENO so coverage contracts find setup-deno ([a20baa1](https://github.com/maiprop/maiprop-listing-site/commit/a20baa165728a7c5b20ff52294a95e9a9302839b))
* **ci:** install Deno before coverage contracts step ([ff68fdd](https://github.com/maiprop/maiprop-listing-site/commit/ff68fddab609b5455ca74f48e943857e4f4b299f))
* **ci:** run advisor index contracts under node:test instead of vitest ([f347f7d](https://github.com/maiprop/maiprop-listing-site/commit/f347f7d9a557ccd6d44b5a63cc21db004ed21844))
* **ci:** scope catalogue database logins to phases ([#597](https://github.com/maiprop/maiprop-listing-site/issues/597)) ([9678a6d](https://github.com/maiprop/maiprop-listing-site/commit/9678a6d77da0875af50583c7a12a2e6759435a5a))
* classify catalogue preparation drift ([#622](https://github.com/maiprop/maiprop-listing-site/issues/622)) ([b93aaa7](https://github.com/maiprop/maiprop-listing-site/commit/b93aaa7c16d8615d35a75447b5671a97e2cff32c))
* classify pinned native assertion coverage suite ([09d68dd](https://github.com/maiprop/maiprop-listing-site/commit/09d68ddf4834317be63178127bf73e81c3a54c04))
* clear live Supabase advisor drift ([8fa5fe1](https://github.com/maiprop/maiprop-listing-site/commit/8fa5fe1797e1232d23724a804f06123445b648b7))
* commit ranked location suggestions ([089f38a](https://github.com/maiprop/maiprop-listing-site/commit/089f38a37f8892c819594bd7a05387889ed8f418))
* complete developer fixture and retain checkout failure evidence ([4198d2c](https://github.com/maiprop/maiprop-listing-site/commit/4198d2cce7c26dab2db9edc3291bcb4ad07853ac))
* complete free ECAS B-grade hardening ([#506](https://github.com/maiprop/maiprop-listing-site/issues/506)) ([4097fee](https://github.com/maiprop/maiprop-listing-site/commit/4097fee723668fecb3b2f7426dab5f9df7786e21))
* complete trusted provider bootstrap ([#569](https://github.com/maiprop/maiprop-listing-site/issues/569)) ([5af1704](https://github.com/maiprop/maiprop-listing-site/commit/5af17045eb7fc6e06a5831af5e403b45ddfe1edb))
* contain auction property detail grid on narrow screens ([5e060a7](https://github.com/maiprop/maiprop-listing-site/commit/5e060a71b0884baaeb5b3147ac5f50547f5cd4fc))
* contain mobile detail breadcrumbs ([917e72b](https://github.com/maiprop/maiprop-listing-site/commit/917e72b0b508c30e4db06784c1af07e1182a042b))
* **db:** allow firesale interest cascade deletion ([7c5becc](https://github.com/maiprop/maiprop-listing-site/commit/7c5beccfb661c01bb7b6c58797e94ca64a82f4a9))
* **db:** clear staging advisor release blockers ([c0dc7ec](https://github.com/maiprop/maiprop-listing-site/commit/c0dc7ecdbaf0e13618248feeadfcb60a1ca835ef))
* **db:** enforce local prerequisite migration guards ([c5e7945](https://github.com/maiprop/maiprop-listing-site/commit/c5e79459472caf0478f84ad52ecaf3fd960430e4))
* **db:** guard scheduled trace drift and index reconciliation ([be0df3f](https://github.com/maiprop/maiprop-listing-site/commit/be0df3f0d730b83bdbd292cd509e117fbf7be407))
* **db:** make firesale audit GUC defaults privilege-tolerant (break-glass STAGE-20261020-E533D00C-RETRY) ([b366568](https://github.com/maiprop/maiprop-listing-site/commit/b3665682a75e4c9c7f37192320365e2d90dc97cf))
* **db:** preserve email retry tokens and repair progress ([019d5dd](https://github.com/maiprop/maiprop-listing-site/commit/019d5dd47f984845f1a6d9a4f9553e53b24da585))
* **db:** preserve same-tier invitation reapproval state ([27e6baa](https://github.com/maiprop/maiprop-listing-site/commit/27e6baaaee0144784af6491b971aa20fcd2f27c0))
* **db:** preserve spendable AI reservation credits ([a2905aa](https://github.com/maiprop/maiprop-listing-site/commit/a2905aa2581abe52b9764453db010fdb97bc1114))
* **db:** re-pin sync_log policy guard to server-canonical rendering (break-glass STAGE-20261020-e533d00c-retry) ([33d1a81](https://github.com/maiprop/maiprop-listing-site/commit/33d1a812a7afd7ae66fd3730b5ca07633913fc4d))
* **db:** reject unknown platform admin identities ([5142b43](https://github.com/maiprop/maiprop-listing-site/commit/5142b43803bd27c87e9417eb4329a6eb01066f72))
* **db:** restore firesale expiry audit context ([d71e6a3](https://github.com/maiprop/maiprop-listing-site/commit/d71e6a38242a67c0e50bff9c34035c92e65a3484))
* **db:** restore firesale request service write boundary ([97e6e49](https://github.com/maiprop/maiprop-listing-site/commit/97e6e498966af0e8d5ced1ec698cb4d04cec6185))
* **db:** restore sync_log policy guard pin after staging repair (break-glass STAGE-20261020-e533d00c-retry) ([81f3036](https://github.com/maiprop/maiprop-listing-site/commit/81f3036157d070193663994b31d4ea72ef3250d0))
* **db:** tolerate pg_net http_post signature drift in dispatch guard ([b3668ca](https://github.com/maiprop/maiprop-listing-site/commit/b3668ca65b98c976d2110682de6c6bf9f5be7e00))
* **db:** tolerate staging whitespace and role-OID drift in email guard (break-glass STAGE-20261020-E533D00C-RETRY) ([2661e6e](https://github.com/maiprop/maiprop-listing-site/commit/2661e6e8e2424a815cd58f1a4862ff1d776ec687))
* **deps:** patch deployment audit dependencies ([41f402a](https://github.com/maiprop/maiprop-listing-site/commit/41f402a0878e9142b7d1652293f9f7194787a2d7))
* disable production release mutations ([#561](https://github.com/maiprop/maiprop-listing-site/issues/561)) ([16de11e](https://github.com/maiprop/maiprop-listing-site/commit/16de11e4f98a81abca185816e5936d86949ed2e2))
* dismiss owned checkout toast ([a8f39bd](https://github.com/maiprop/maiprop-listing-site/commit/a8f39bd021f63ec7f9df96cffb03b243428eb425))
* **e2e:** modernize valuation specs for V2 sourced-evidence model, harden api-docs a11y ([356cb65](https://github.com/maiprop/maiprop-listing-site/commit/356cb65d7ca85b35f3021384daac39d34a28b468))
* **edge:** bound OS wait with race-to-fallback budget in valuation + neighbourhood report ([#683](https://github.com/maiprop/maiprop-listing-site/issues/683)) ([c27156d](https://github.com/maiprop/maiprop-listing-site/commit/c27156dc90919bf5f4efb850ed776f8b4aebaa7f))
* **edge:** preserve partial scheduled trace outcomes ([3502f7c](https://github.com/maiprop/maiprop-listing-site/commit/3502f7c78439b275a887daf873dd1d54c3ab6a62))
* **edge:** satisfy invoice deno check ([3c33b4f](https://github.com/maiprop/maiprop-listing-site/commit/3c33b4f7aaf58f94453679ac39cdafa43449ec1f))
* **email:** hold reset steps and refresh scheduler stock ([4c2fad4](https://github.com/maiprop/maiprop-listing-site/commit/4c2fad4e8872086b0940994544bf1021ad80cb55))
* **email:** persist queue rate limits accurately ([4b18ab0](https://github.com/maiprop/maiprop-listing-site/commit/4b18ab0551a331cb0e9c52efe131feffca802901))
* **email:** separate queue acceptance from bookkeeping ([f4ec57d](https://github.com/maiprop/maiprop-listing-site/commit/f4ec57da86aff5d34b9495d889094e6495cc4329))
* enforce paid listing promotion entitlements ([70e5ffe](https://github.com/maiprop/maiprop-listing-site/commit/70e5ffe96f11410758161ceb7d2b31b2c4d71171))
* expose aggregate catalogue source diagnostics ([#616](https://github.com/maiprop/maiprop-listing-site/issues/616)) ([7679b62](https://github.com/maiprop/maiprop-listing-site/commit/7679b629d96ceac40eb8bcf8fca1f228e0f7865e))
* expose safe catalogue identity diagnostics ([#618](https://github.com/maiprop/maiprop-listing-site/issues/618)) ([ee4efed](https://github.com/maiprop/maiprop-listing-site/commit/ee4efed0ec62f0e037b7330f1f4ce2b8bcc2041d))
* fallback address suggestions to locality ([#486](https://github.com/maiprop/maiprop-listing-site/issues/486)) ([4c4f838](https://github.com/maiprop/maiprop-listing-site/commit/4c4f838151f9604720869cde254ee7a30d1846ab))
* filter address fallbacks by typed context ([94a8d72](https://github.com/maiprop/maiprop-listing-site/commit/94a8d72c917d176cd8cc51f4157b1b3ae1db99e2))
* finalize billing promotions and deploy checks ([5f6c69a](https://github.com/maiprop/maiprop-listing-site/commit/5f6c69a61162da90949bffbee850d74e6136c280))
* finalize stripe billing release wiring ([288c576](https://github.com/maiprop/maiprop-listing-site/commit/288c5768c7863ec8583c3777a19bf24de0c21bf5))
* flatten signed release artifacts ([25f8cc4](https://github.com/maiprop/maiprop-listing-site/commit/25f8cc4a00fc2ab98af5063ea353f82fe05738a7))
* gate admin open house controls by listing authority ([592f648](https://github.com/maiprop/maiprop-listing-site/commit/592f648bf431ff335e5ebafeb6d149af1b2aa289))
* **governance:** document billing function boundaries ([89a6d12](https://github.com/maiprop/maiprop-listing-site/commit/89a6d12c9c22704abfdf9b76faa32b1f9c425516))
* group location search synonym filters ([#488](https://github.com/maiprop/maiprop-listing-site/issues/488)) ([56a9c00](https://github.com/maiprop/maiprop-listing-site/commit/56a9c00f4afaf1152e9c6e19d3ebd5005682b56e))
* guard Edge coverage source attribution ([334cdef](https://github.com/maiprop/maiprop-listing-site/commit/334cdef83cd05f202f37f9d448034b6332e0e669))
* guard legacy report work and noise labels ([fcba584](https://github.com/maiprop/maiprop-listing-site/commit/fcba584e72628f1abf64f58c953a408e0234ebff))
* guard open house status email event admission ([3d3ffc8](https://github.com/maiprop/maiprop-listing-site/commit/3d3ffc8731272695ce102ba8d49090a54efd8b55))
* harden address autocomplete and stripe runtime ([68db888](https://github.com/maiprop/maiprop-listing-site/commit/68db8881e7fa545bd904286abc55a7a4352055c2))
* harden address autocomplete experience ([#470](https://github.com/maiprop/maiprop-listing-site/issues/470)) ([134b4bb](https://github.com/maiprop/maiprop-listing-site/commit/134b4bb1f24b4393ddfb58b375a9e1e26c74f43d))
* harden catalogue cache and promotion reporting ([#544](https://github.com/maiprop/maiprop-listing-site/issues/544)) ([b5f9dc7](https://github.com/maiprop/maiprop-listing-site/commit/b5f9dc74eec3e3eabf93fe6d61c6389c4cab0420))
* harden ecas billing and deployment evidence ([ff90ab5](https://github.com/maiprop/maiprop-listing-site/commit/ff90ab5703495777e41607f2086b1544b13838bf))
* harden ecas ui and supabase release wiring ([d9d88e0](https://github.com/maiprop/maiprop-listing-site/commit/d9d88e05868999cb4e54f485de758141547aa98a))
* harden ecas ux valuation and deployment checks ([ef5f237](https://github.com/maiprop/maiprop-listing-site/commit/ef5f2375885da799b61b3a962aa4c3156092eccd))
* harden edge request validation ([b66889a](https://github.com/maiprop/maiprop-listing-site/commit/b66889a6aff04ebecd7a60b80207002d954d4257))
* harden entitlements, messaging, and report workflows ([#534](https://github.com/maiprop/maiprop-listing-site/issues/534)) ([88b513d](https://github.com/maiprop/maiprop-listing-site/commit/88b513d4bf9c4a8b9d49df08df07d666675f9672))
* harden homepage initial payload fallback ([0852fca](https://github.com/maiprop/maiprop-listing-site/commit/0852fcada0339b8d59cdc5681ab3e37cfc5584af))
* harden homepage public api latency ([25fa8d8](https://github.com/maiprop/maiprop-listing-site/commit/25fa8d8bf6c7418fb670aa10fc6444878bec791d))
* harden main ecas evidence and responsiveness ([#453](https://github.com/maiprop/maiprop-listing-site/issues/453)) ([26372c3](https://github.com/maiprop/maiprop-listing-site/commit/26372c3a90b6a1fcb988622bfde8fc202c5483b7))
* harden main ecas readiness ([bce7062](https://github.com/maiprop/maiprop-listing-site/commit/bce70620b8d859832af918cf88102fe83c734502))
* harden public listings load path ([fbeb6e0](https://github.com/maiprop/maiprop-listing-site/commit/fbeb6e0807a3fb09241972167bee5d7f4f7ad180))
* harden release capability preflight ([9c2e06b](https://github.com/maiprop/maiprop-listing-site/commit/9c2e06b47067ca289060d16e774e69e226277ac5))
* **homepage:** keep market claims evidence based ([c4200cb](https://github.com/maiprop/maiprop-listing-site/commit/c4200cbf63b7fc8ce314fc8031e30f02ca85da9a))
* ignore missing listing location coordinates ([3089b98](https://github.com/maiprop/maiprop-listing-site/commit/3089b9800e9a9b9ecf83b68d625a10d7b1c117b4))
* improve homepage inventory loading ([bf33ad2](https://github.com/maiprop/maiprop-listing-site/commit/bf33ad2b53a44fca2d6c169edd757a81563f3ed1))
* integrate pricing, address, rental valuation, and mobile corrections ([#541](https://github.com/maiprop/maiprop-listing-site/issues/541)) ([a864a72](https://github.com/maiprop/maiprop-listing-site/commit/a864a72d2bfc207d29d539fbdf23ec85662fe281))
* integrate verified worktree improvements ([#545](https://github.com/maiprop/maiprop-listing-site/issues/545)) ([cc5fb1b](https://github.com/maiprop/maiprop-listing-site/commit/cc5fb1bb310e946a1228bbb6af4d51dc9a7b8ac9))
* isolate provenance evidence from release payload ([08a383f](https://github.com/maiprop/maiprop-listing-site/commit/08a383f063b4d885646a363492f7ba77e6048979))
* isolate public cache responses and recover stalled open house requests ([ef20465](https://github.com/maiprop/maiprop-listing-site/commit/ef2046572107fe1cda3b7aacb769af563c819760))
* **listings:** rotate public catalogue cache key past wedged sale-grid entry ([#682](https://github.com/maiprop/maiprop-listing-site/issues/682)) ([ecf9080](https://github.com/maiprop/maiprop-listing-site/commit/ecf9080a9fd4eaf2daae9c8bf5eb0fa1ab9f8c69))
* **listings:** route managed project ads to linked projects ([017db7a](https://github.com/maiprop/maiprop-listing-site/commit/017db7a18a2355f18511ee05aa4a1880b4386cc9))
* make catalogue recovery accounting dynamic ([#624](https://github.com/maiprop/maiprop-listing-site/issues/624)) ([c436659](https://github.com/maiprop/maiprop-listing-site/commit/c436659fc454990d56f5dd178bb9866a78b995a6))
* make new-build AI insights user-triggered ([#536](https://github.com/maiprop/maiprop-listing-site/issues/536)) ([d8da42e](https://github.com/maiprop/maiprop-listing-site/commit/d8da42ec879e3671d7ed925e70dbb11d97336afd))
* make private platform admin check total ([77354cb](https://github.com/maiprop/maiprop-listing-site/commit/77354cb735fc3b8d0f40dd922e10dda8590b01fa))
* make stripe catalog metadata sql rerunnable ([e0deeee](https://github.com/maiprop/maiprop-listing-site/commit/e0deeee7d8c628454ef40d2c952651734b793069))
* **messages:** reset account-scoped screen state on switch ([141f903](https://github.com/maiprop/maiprop-listing-site/commit/141f903aa0681e080dde4e5ee193f5c8365043a8))
* **messages:** skip stale optimistic send after account return ([54bf6d4](https://github.com/maiprop/maiprop-listing-site/commit/54bf6d4bfab50e4fd26ea6156052e1cd7e038979))
* **migrations:** remove duplicate reconciliation placeholders ([b076bd0](https://github.com/maiprop/maiprop-listing-site/commit/b076bd06de4965e2da0b5fd572847b6fc6c58492))
* **migrations:** update reconciliation compatibility test ([877fede](https://github.com/maiprop/maiprop-listing-site/commit/877fede97658e15aaafb7c22a0e00bb6052a72db))
* **new-build:** close enquiry lifecycle gaps ([7d29088](https://github.com/maiprop/maiprop-listing-site/commit/7d290881f73dbe78895ef63cd0b8c8591b5079ce))
* **new-build:** keep enquiry success wording factual ([49b6395](https://github.com/maiprop/maiprop-listing-site/commit/49b6395e0339f181a9ffdd310f774029de01ff1d))
* **new-build:** make enquiry retries durable ([51f6a9d](https://github.com/maiprop/maiprop-listing-site/commit/51f6a9d1d1570f08954bb0ab205260f732cb7f3f))
* **new-build:** prevent false enquiry confirmations ([7a034be](https://github.com/maiprop/maiprop-listing-site/commit/7a034be5475850d404586d6c7b400d0e726e64c5))
* normalize hotfix database TLS URLs ([c0ab8ce](https://github.com/maiprop/maiprop-listing-site/commit/c0ab8ce8ed78c1f883b3ac56d7b627763e0cc8af))
* normalize Supabase types and project policy drift ([c106700](https://github.com/maiprop/maiprop-listing-site/commit/c10670090edba4259a295434b323c744459a1323))
* **open-houses:** enforce service RSVP quota ([e67777e](https://github.com/maiprop/maiprop-listing-site/commit/e67777e407052d7e68111346eae7f31523e91ceb))
* pass local database probes through SQL files ([b54af2b](https://github.com/maiprop/maiprop-listing-site/commit/b54af2bc9de2b37ce35af8b787fb8916c77c875f))
* **perf:** batch catalogue identity migration ([#620](https://github.com/maiprop/maiprop-listing-site/issues/620)) ([4523b1b](https://github.com/maiprop/maiprop-listing-site/commit/4523b1ba6a959cc737a72370ced066a1580a2eb1))
* **perf:** clear cancelled query timing ([8a67de6](https://github.com/maiprop/maiprop-listing-site/commit/8a67de6b8c79d64f5fddd857b7bbde6179ac0044))
* **perf:** measure query lifecycles and overlap seo reads ([e9d63c8](https://github.com/maiprop/maiprop-listing-site/commit/e9d63c8c02e3493819c3a8b9fd6f32ff61f371d6))
* **perf:** reconcile E2E query budgets with pinned mount handoff ([66ad703](https://github.com/maiprop/maiprop-listing-site/commit/66ad70322811a5cb7499508ee9375a6554dfd427))
* persist public API cache entries ([#531](https://github.com/maiprop/maiprop-listing-site/issues/531)) ([39e56e7](https://github.com/maiprop/maiprop-listing-site/commit/39e56e7ba677fb966ccaf4199898b2b66e94700e))
* preserve auction pagination and repair staging runtime contracts ([e7c2619](https://github.com/maiprop/maiprop-listing-site/commit/e7c261938aacd00ee5d8eb239be49875f87c3d9e))
* preserve complete auction pool metadata ([9629164](https://github.com/maiprop/maiprop-listing-site/commit/96291647c80f4277d8ca9654a37f60da904d9bfc))
* preserve neighbourhood report evidence and availability ([c0efd6a](https://github.com/maiprop/maiprop-listing-site/commit/c0efd6add088f4a91a6b66465d6bf75f376f57b0))
* preserve POI and walk score provenance ([24ef68f](https://github.com/maiprop/maiprop-listing-site/commit/24ef68ff4310ac0794b7ea636011ac09356c1fa1))
* preserve scheduled dispatch client contract ([10c6c68](https://github.com/maiprop/maiprop-listing-site/commit/10c6c688d50a62ada1842e563b262379af4913ce))
* preserve staging Checkout return origin ([#656](https://github.com/maiprop/maiprop-listing-site/issues/656)) ([af81798](https://github.com/maiprop/maiprop-listing-site/commit/af817983c11c62fd92171f10889f3667d061fc9b))
* preserve valuation evidence across consumers ([9fda295](https://github.com/maiprop/maiprop-listing-site/commit/9fda2957556233e6c86db9d17be8a0b72abc85ed))
* probe live staging Supabase keys ([989abde](https://github.com/maiprop/maiprop-listing-site/commit/989abde37b366504c97a81da1be2c517028dabf4))
* probe Supabase public keys via Auth settings ([2559a62](https://github.com/maiprop/maiprop-listing-site/commit/2559a62abfaf3bb47a2df99eebaec7ff70e6e801))
* **professionals:** restore public projection and private row boundary ([6a10b07](https://github.com/maiprop/maiprop-listing-site/commit/6a10b0707aeb25f5f95a1ac95354d7737875821c))
* **professionals:** stage public interface before management hardening ([823f809](https://github.com/maiprop/maiprop-listing-site/commit/823f80950584127dc1160d5bda7b6ed4d4327f81))
* prove catalogue hotfix database role ([#601](https://github.com/maiprop/maiprop-listing-site/issues/601)) ([7330f29](https://github.com/maiprop/maiprop-listing-site/commit/7330f298154b5ecef8f96c5f05dd6942516f650d))
* provide release CI repository context ([#510](https://github.com/maiprop/maiprop-listing-site/issues/510)) ([32ba413](https://github.com/maiprop/maiprop-listing-site/commit/32ba41386c3657fe28bbc18b9b098251ec5109cf))
* publish release checks asynchronously ([#512](https://github.com/maiprop/maiprop-listing-site/issues/512)) ([a0b19ac](https://github.com/maiprop/maiprop-listing-site/commit/a0b19acfad116c4a150aa5b3f0b8cb13724ede3c))
* quarantine invalid catalogue identities ([#617](https://github.com/maiprop/maiprop-listing-site/issues/617)) ([c257255](https://github.com/maiprop/maiprop-listing-site/commit/c25725516bc6ef20e1648cc2fbdcc66849d41197))
* rank listing address suggestions by location context ([7d4abb4](https://github.com/maiprop/maiprop-listing-site/commit/7d4abb494a18804c3ed94e70872a1adbc2515b8e))
* rank visible listing address suggestions ([d998214](https://github.com/maiprop/maiprop-listing-site/commit/d99821417b03a072803248fb1f929beb1e8fabba))
* recognize fully applied catalogue hotfix state ([#615](https://github.com/maiprop/maiprop-listing-site/issues/615)) ([c368967](https://github.com/maiprop/maiprop-listing-site/commit/c36896784062679587b0953d25481a0fa820d0ef))
* recognize guarded public index migrations ([86571ca](https://github.com/maiprop/maiprop-listing-site/commit/86571ca53ae23a733aff61768edd964794405373))
* reconcile canonical Stripe sync prices and recover catalog identities ([6fb1594](https://github.com/maiprop/maiprop-listing-site/commit/6fb1594c1018dc199ee32670f47db11904ba7310))
* reconcile production catalogue recovery ([#625](https://github.com/maiprop/maiprop-listing-site/issues/625)) ([e264bae](https://github.com/maiprop/maiprop-listing-site/commit/e264bae4959697a476ef1ddac6bc0c240ea3d23d))
* reconcile production migration history ([c7dcc32](https://github.com/maiprop/maiprop-listing-site/commit/c7dcc32907f7aff7aa91f93c343072b4ad1eace3))
* reconcile recorded Stripe prices for one config ([d2d5d5c](https://github.com/maiprop/maiprop-listing-site/commit/d2d5d5c66809e6a869c3e05240091287a3696371))
* recover exact catalogue preparation state ([#623](https://github.com/maiprop/maiprop-listing-site/issues/623)) ([2dd610c](https://github.com/maiprop/maiprop-listing-site/commit/2dd610c7d5fd227c1cee8b2ed59d583909c26b73))
* recover poisoned public cache entries ([#527](https://github.com/maiprop/maiprop-listing-site/issues/527)) ([c8f2f90](https://github.com/maiprop/maiprop-listing-site/commit/c8f2f90089694ee0998b9089c51a0950637f8581))
* reduce ai quota status latency ([de528c7](https://github.com/maiprop/maiprop-listing-site/commit/de528c73ecefff9b9ed02f920508772ea07c276f))
* refresh live Supabase generated types ([f844829](https://github.com/maiprop/maiprop-listing-site/commit/f844829ec2814335c3cd3c2bf6d6d81e57945a6d))
* refresh live Supabase types ([76f4244](https://github.com/maiprop/maiprop-listing-site/commit/76f4244f1a5867d1519b063a1fd6081b549a6f63))
* refresh live Supabase types ([82890d9](https://github.com/maiprop/maiprop-listing-site/commit/82890d9c72e9ce4e2fcfcac9db09f8353427c381))
* refresh live Supabase types ([b3a68e2](https://github.com/maiprop/maiprop-listing-site/commit/b3a68e2bd9505f6086b73f285f3b27745c0a903a))
* refresh production supabase generated types ([00b3bb2](https://github.com/maiprop/maiprop-listing-site/commit/00b3bb26302de5e81658f59185259333854772e7))
* **release:** accept bounded Supabase login ttl ([#596](https://github.com/maiprop/maiprop-listing-site/issues/596)) ([982d0be](https://github.com/maiprop/maiprop-listing-site/commit/982d0be5a1763f34bdf675709524f6a0258338a6))
* **release:** accept live non-completed runs in same-run binding check ([10c3a2e](https://github.com/maiprop/maiprop-listing-site/commit/10c3a2e42bef835ee3fc056bef80051aaa65281f))
* **release:** accept staging account write token ([c19c469](https://github.com/maiprop/maiprop-listing-site/commit/c19c4696369589e7d16c1f3655fcecd2cf51d47c))
* **release:** accept terminal open-house cursor page ([#635](https://github.com/maiprop/maiprop-listing-site/issues/635)) ([28f39e7](https://github.com/maiprop/maiprop-listing-site/commit/28f39e74c15bcb4363d51eabea25bb86757f089a))
* **release:** align binding contract test with full-tree source verification ([b239f2d](https://github.com/maiprop/maiprop-listing-site/commit/b239f2dee5f262b1f14aefd1d0c143264e7c3b2d))
* **release:** align contract tests with password-derived production DB URL ([dd5c911](https://github.com/maiprop/maiprop-listing-site/commit/dd5c91188f02c78cadd07ce05c52a21dfe385953))
* **release:** align reconciliation evidence with canonical RPC ([6498da6](https://github.com/maiprop/maiprop-listing-site/commit/6498da61ea6fc10e20ce9809d8c2b67371f99d8f))
* **release:** align SLSA marker with live-run liveness check ([d42c7c9](https://github.com/maiprop/maiprop-listing-site/commit/d42c7c9208f5339a3078603e27b96b77c4f30998))
* **release:** authenticate N-1 tree lookup ([#637](https://github.com/maiprop/maiprop-listing-site/issues/637)) ([51722e9](https://github.com/maiprop/maiprop-listing-site/commit/51722e938324da19ef3471cefbb74d41ef57f3c5))
* **release:** authenticate production main checks ([356eead](https://github.com/maiprop/maiprop-listing-site/commit/356eead992e303d371e2cb22a425f5e38a486c2a))
* **release:** authenticate production main checks ([ed0e0cc](https://github.com/maiprop/maiprop-listing-site/commit/ed0e0cc0f3654f2151b2cf51442ae3b8850b93b6))
* **release:** canonicalize catalogue database identity URLs ([465f547](https://github.com/maiprop/maiprop-listing-site/commit/465f547cce48819d81e11efbab7ee8b082515a30))
* **release:** canonicalize staging database URL ([3bea065](https://github.com/maiprop/maiprop-listing-site/commit/3bea065c14ab5bd3399c0926da4c87b9f2c17a28))
* **release:** classify 13 new staging advisor findings as reviewed debt (break-glass STAGE-20261020-E533D00C-RETRY) ([424e735](https://github.com/maiprop/maiprop-listing-site/commit/424e735bacb52ed16288aefb357e1b7e56099d85))
* **release:** clean supabase cli dry-run state ([5ceea9a](https://github.com/maiprop/maiprop-listing-site/commit/5ceea9a7f647b8b1eebfa7089dd5ac4f029eb709))
* **release:** clean Supabase CLI staging scratch ([#634](https://github.com/maiprop/maiprop-listing-site/issues/634)) ([474a0be](https://github.com/maiprop/maiprop-listing-site/commit/474a0bed55314d79a1df49f5d91de9f6a5be2019))
* **release:** correct reviewed staging alias hash ([1d63515](https://github.com/maiprop/maiprop-listing-site/commit/1d63515709d04b257f7538a9261a98eda74489bb))
* **release:** export Stripe evidence run identity ([e57d2ba](https://github.com/maiprop/maiprop-listing-site/commit/e57d2ba58a89308ed740d0ec84d5593a91a28431))
* **release:** make staging catalogue proof deterministic ([ade71c2](https://github.com/maiprop/maiprop-listing-site/commit/ade71c29677a6af750fce52a09fe34e882d7493d))
* **release:** package required reconciliation SQL ([970d621](https://github.com/maiprop/maiprop-listing-site/commit/970d6213782fb288910889d4587f262a6753ee31))
* **release:** parse Supabase pending migration filenames ([#605](https://github.com/maiprop/maiprop-listing-site/issues/605)) ([bb98f25](https://github.com/maiprop/maiprop-listing-site/commit/bb98f25eb1c306bbe7f2d4e947d7d267036bbfce))
* **release:** poll run status before same-run candidate binding ([d5df015](https://github.com/maiprop/maiprop-listing-site/commit/d5df0151eeb54d66dd1e30e983cdfdea67148139))
* **release:** poll workflow-runs list before accepting empty lease reads ([1ee5c0b](https://github.com/maiprop/maiprop-listing-site/commit/1ee5c0b69b735eba85b983cfae5147ce0d1d5fe0))
* **release:** provide GITHUB_TOKEN to production mutation-lease validators ([121117a](https://github.com/maiprop/maiprop-listing-site/commit/121117a26e2f6f832b8870f2a121159833f8bb07))
* **release:** reconcile reviewed staging aliases ([0eed394](https://github.com/maiprop/maiprop-listing-site/commit/0eed3946e654f6b6ff01cae8bd516c272a96a6f1))
* **release:** regenerate Supabase types from staging and align new-build phone arg (break-glass STAGE-20261020-E533D00C-RETRY) ([9b5951d](https://github.com/maiprop/maiprop-listing-site/commit/9b5951d325b94e9c17b0d03a6bc303bd5693d8b2))
* **release:** remove staging cli scratch state ([f5de80e](https://github.com/maiprop/maiprop-listing-site/commit/f5de80ea553a64b614937d4e751c2c53b080b5e9))
* **release:** repair live staging proof blockers ([#639](https://github.com/maiprop/maiprop-listing-site/issues/639)) ([2df35da](https://github.com/maiprop/maiprop-listing-site/commit/2df35da91b7be54914e74764910b3fbcf76d0d43))
* **release:** repair staging proof contracts ([86efecc](https://github.com/maiprop/maiprop-listing-site/commit/86efecc85ca7a1e9c069a082b327e6f56de0953d))
* **release:** repair staging proof prerequisites ([34a21b5](https://github.com/maiprop/maiprop-listing-site/commit/34a21b510c94e8168257f1e6128de095a21fdba8))
* **release:** repair staging proof prerequisites ([#638](https://github.com/maiprop/maiprop-listing-site/issues/638)) ([34a21b5](https://github.com/maiprop/maiprop-listing-site/commit/34a21b510c94e8168257f1e6128de095a21fdba8))
* **release:** resolve digest via public schema in evidence queries (break-glass STAGE-20261020-E533D00C-RETRY) ([633adb1](https://github.com/maiprop/maiprop-listing-site/commit/633adb152214e7fa454ab98cefa3e58a73dd7dd1))
* **release:** resolve production DB URL from password in deploy jobs ([212ed4d](https://github.com/maiprop/maiprop-listing-site/commit/212ed4d3b2acf79761fc1999681ef1d2ccb86d30))
* **release:** retry N-1 CI and artifact list reads on transient empty pages ([f0088d8](https://github.com/maiprop/maiprop-listing-site/commit/f0088d85d4896d2bd685cff662d5187579cc177a))
* **release:** retry staging edge evidence convergence ([#633](https://github.com/maiprop/maiprop-listing-site/issues/633)) ([1ad8cf7](https://github.com/maiprop/maiprop-listing-site/commit/1ad8cf7f48b69d4d560134e4193695b26dea55e4))
* **release:** tolerate staging alias propagation ([#662](https://github.com/maiprop/maiprop-listing-site/issues/662)) ([e55e592](https://github.com/maiprop/maiprop-listing-site/commit/e55e592cfd470e45a7c68eec7656b4d5af76c50e))
* **release:** unblock final staging proofs ([#640](https://github.com/maiprop/maiprop-listing-site/issues/640)) ([ed2e6cc](https://github.com/maiprop/maiprop-listing-site/commit/ed2e6ccb4c0ef7c7bad999ba033a586ad51c5169))
* **release:** unblock staging live proofs ([#641](https://github.com/maiprop/maiprop-listing-site/issues/641)) ([334d9c2](https://github.com/maiprop/maiprop-listing-site/commit/334d9c26a2e79705342471dae7b4d5bb3dba5a7b))
* **release:** use official linked migration login ([#602](https://github.com/maiprop/maiprop-listing-site/issues/602)) ([9aafdd2](https://github.com/maiprop/maiprop-listing-site/commit/9aafdd233a40a7e3b18d7c7f7d890a6a7279c8f2))
* **release:** use supported Pages pagination ([901369a](https://github.com/maiprop/maiprop-listing-site/commit/901369a58606960a3556aed8964814e633bfa719))
* **release:** use temporary Supabase login ([b6c6d6a](https://github.com/maiprop/maiprop-listing-site/commit/b6c6d6afc09a756a127d2e822020c53cc0e8bc32))
* **release:** validate separate advisor CLI output streams ([6afd9ff](https://github.com/maiprop/maiprop-listing-site/commit/6afd9fffff693002587ed243e031bfbd061f2717))
* **release:** validate signed provenance object ([#664](https://github.com/maiprop/maiprop-listing-site/issues/664)) ([54dde1c](https://github.com/maiprop/maiprop-listing-site/commit/54dde1c2817fb00b4e5ed9faefedc560c2922a4b))
* **release:** verify consumption receipts against the active deployment ([22becf9](https://github.com/maiprop/maiprop-listing-site/commit/22becf9824b54067e2405e4c754cdda7cf2fa0ce))
* **release:** verify full source tree in production provider bindings ([c54f107](https://github.com/maiprop/maiprop-listing-site/commit/c54f1077120a2af06577bf2293d5b410f6b324ef))
* **release:** wait for runtime route propagation ([4475912](https://github.com/maiprop/maiprop-listing-site/commit/44759128d5e8c88c1c21d1a20adfaa8667d6e1c8))
* **release:** wait for staging alias propagation ([e55e592](https://github.com/maiprop/maiprop-listing-site/commit/e55e592cfd470e45a7c68eec7656b4d5af76c50e))
* remove esm supabase dependency from edge checks ([98889b9](https://github.com/maiprop/maiprop-listing-site/commit/98889b965e5316b729799f1858a8a6965a3c4d28))
* remove verified dead code and preserve cleanup contracts ([baa3748](https://github.com/maiprop/maiprop-listing-site/commit/baa3748a5e1abf2af8ae6d59249f0bade18f685f))
* render supported valuation density ([f0a0763](https://github.com/maiprop/maiprop-listing-site/commit/f0a0763881d8c4337ea4746d801aa14101c23a74))
* repair production read capabilities ([1c1c6f9](https://github.com/maiprop/maiprop-listing-site/commit/1c1c6f9f4956a60a5d1177daa971c8a61f768fb1))
* replay-faithful migration harness, stale policy pin, mount-once subscription restore ([2be3e4f](https://github.com/maiprop/maiprop-listing-site/commit/2be3e4f604a9980ef2998bf2fcf7e31698ad51ff))
* report incomplete sampled auction pages ([40842cf](https://github.com/maiprop/maiprop-listing-site/commit/40842cf52fa6cd178b15139df913840cf76a55e7))
* report scheduled email and auction outcomes truthfully ([f85ac80](https://github.com/maiprop/maiprop-listing-site/commit/f85ac80b0018fdfb8361e5b95c8fec89ed188379))
* require sourced valuation evidence ([8e94287](https://github.com/maiprop/maiprop-listing-site/commit/8e942877a7eeae674dd5b3534cc65e3feb50ed66))
* resolve current staging Supabase key ([71e106e](https://github.com/maiprop/maiprop-listing-site/commit/71e106e9ca3d490fe3cb85bae0bac904f883d30c))
* resolve live ux regression paths ([9d28db6](https://github.com/maiprop/maiprop-listing-site/commit/9d28db69eb802e74653ffe1554bb309d3953125e))
* resolve live UX regression paths ([3e47d80](https://github.com/maiprop/maiprop-listing-site/commit/3e47d805ea8509ba38de03bf60df5b9111572994))
* resolve street-number location suggestions ([#498](https://github.com/maiprop/maiprop-listing-site/issues/498)) ([aae8309](https://github.com/maiprop/maiprop-listing-site/commit/aae8309834df6206099a53d1694e1026957b4c37))
* resolve wave 0 final review blockers ([3809419](https://github.com/maiprop/maiprop-listing-site/commit/3809419554d0fb79ad2714c84ebdf2457c6341bb))
* restore frontend coverage gates ([ea7c889](https://github.com/maiprop/maiprop-listing-site/commit/ea7c889f2b9b85aabf437612688ee127c9a61f10))
* restore homepage open houses and bound catalogue latency ([#533](https://github.com/maiprop/maiprop-listing-site/issues/533)) ([dc14e25](https://github.com/maiprop/maiprop-listing-site/commit/dc14e25548c702ce43be81e1239dff4a65aab3f9))
* restore investor payment edge function source ([b4b9075](https://github.com/maiprop/maiprop-listing-site/commit/b4b9075c753d9c9fc63becbb1f0e0544b88b9ff8))
* restore mobile new-build signup flows ([d766500](https://github.com/maiprop/maiprop-listing-site/commit/d76650004a8638b7c904411aa9ec2a40bd98c5a3))
* restore public project API access ([#507](https://github.com/maiprop/maiprop-listing-site/issues/507)) ([178365b](https://github.com/maiprop/maiprop-listing-site/commit/178365b9cd869b7f7d86aecefb08ddb4eacf5b04))
* restore scoped open house listing boundary ([a6e2f69](https://github.com/maiprop/maiprop-listing-site/commit/a6e2f69324b89143eb2048cf27c494512a4f4810))
* retain checked saved alert sender key ([1e55751](https://github.com/maiprop/maiprop-listing-site/commit/1e55751eb1e83d34498bda6e98952aa3bb078589))
* retry exact catalogue migration deadlock ([#621](https://github.com/maiprop/maiprop-listing-site/issues/621)) ([c8a3133](https://github.com/maiprop/maiprop-listing-site/commit/c8a3133003242337b8ee43901bba951c6f2de630))
* retry homepage initial fallback fetches ([#489](https://github.com/maiprop/maiprop-listing-site/issues/489)) ([cb48311](https://github.com/maiprop/maiprop-listing-site/commit/cb48311f451fd118e6762d7cce2970b44ab08d28))
* rotate poisoned public catalogue cache ([#542](https://github.com/maiprop/maiprop-listing-site/issues/542)) ([fce87ec](https://github.com/maiprop/maiprop-listing-site/commit/fce87ec249373741a386d666b700468678df62ff))
* route catalogue hotfix through primary pooler ([#600](https://github.com/maiprop/maiprop-listing-site/issues/600)) ([82a09dc](https://github.com/maiprop/maiprop-listing-site/commit/82a09dc1e13babceae164ecd2c1d850799ea1228))
* route listing detail previews through pages functions ([#485](https://github.com/maiprop/maiprop-listing-site/issues/485)) ([f140579](https://github.com/maiprop/maiprop-listing-site/commit/f140579871ccdb69f6a4bd9e63cac8c6ec6e3b9d))
* sanitize invitation notification errors ([a3eda00](https://github.com/maiprop/maiprop-listing-site/commit/a3eda0098cbf01c27e5a1dcfdde60263ed610990))
* sanitize shared rate limiter failure logs ([48afc1c](https://github.com/maiprop/maiprop-listing-site/commit/48afc1c1085892c88e9a6abaf93d6fadab6f56c9))
* serialize staging admin sessions and use guarded onboarding ([1fda70c](https://github.com/maiprop/maiprop-listing-site/commit/1fda70c26b3a0722b592e3e49418679e60977e84))
* show owner listings in promotion admin ([#532](https://github.com/maiprop/maiprop-listing-site/issues/532)) ([f4ba1e8](https://github.com/maiprop/maiprop-listing-site/commit/f4ba1e8e40ee114a00f44f25f2b3dc2705772c76))
* skip staging DB advisors for function-only changes ([#492](https://github.com/maiprop/maiprop-listing-site/issues/492)) ([a938397](https://github.com/maiprop/maiprop-listing-site/commit/a938397fd03eb1aa8f6f21f9ef0d3a58e43fc8a7))
* stabilize address autocomplete ([dde33e1](https://github.com/maiprop/maiprop-listing-site/commit/dde33e114ebaf27088cbec5a9771f69f42e96c44))
* stabilize auction detail e2e wait ([586d0b1](https://github.com/maiprop/maiprop-listing-site/commit/586d0b1a027d00ce9385a7a5ebd87024591a2f4a))
* stabilize catalogue deploys and message deep links ([6029698](https://github.com/maiprop/maiprop-listing-site/commit/602969857c11c3ad5438ac69aa599bb6a80cd2ea))
* stabilize compare valuation workflow ([#511](https://github.com/maiprop/maiprop-listing-site/issues/511)) ([1629a24](https://github.com/maiprop/maiprop-listing-site/commit/1629a247ed6fda9ea45e0edec0659ec39eb78292))
* stabilize empty spotlight delivery ([#529](https://github.com/maiprop/maiprop-listing-site/issues/529)) ([afe3946](https://github.com/maiprop/maiprop-listing-site/commit/afe394610b3e0c818ea5ca327e7347007d9e7bcd))
* stabilize live operational smoke ([#411](https://github.com/maiprop/maiprop-listing-site/issues/411)) ([6591e66](https://github.com/maiprop/maiprop-listing-site/commit/6591e66e7c75ccdff600c667c1f75ce1555f8511))
* stabilize live professional smoke and CI security gates ([88dbb47](https://github.com/maiprop/maiprop-listing-site/commit/88dbb479e324ff40b7d702d664942e095c337913))
* stabilize OS auction ingestion and catalogue performance ([#613](https://github.com/maiprop/maiprop-listing-site/issues/613)) ([50488de](https://github.com/maiprop/maiprop-listing-site/commit/50488dece51f339633b68f142c800e31f5bfd0b3))
* **supabase:** refresh generated types ([f18d25d](https://github.com/maiprop/maiprop-listing-site/commit/f18d25d56b8346eb329113d135975431a543774b))
* sync live supabase generated types ([1a2ba16](https://github.com/maiprop/maiprop-listing-site/commit/1a2ba167381e07ea898332e155251a735414a282))
* sync production supabase types ([#556](https://github.com/maiprop/maiprop-listing-site/issues/556)) ([6e5f86d](https://github.com/maiprop/maiprop-listing-site/commit/6e5f86d54aff87433050ac0f0008b99b105f62bb))
* synchronize production Supabase types ([#508](https://github.com/maiprop/maiprop-listing-site/issues/508)) ([a8154b6](https://github.com/maiprop/maiprop-listing-site/commit/a8154b69e89806fbde062b6a12442b5d54dc5ea8))
* **test:** align catalogue pgTAP plan ([22a1da0](https://github.com/maiprop/maiprop-listing-site/commit/22a1da0cb71a5c5ffdc0c8905b0af6a17157c05e))
* **test:** expect public-schema digest in production DB workflow (break-glass STAGE-20261020-E533D00C-RETRY) ([ce7bfe4](https://github.com/maiprop/maiprop-listing-site/commit/ce7bfe49ec2f52f8cb0f0247e8bba1cb8e0b159f))
* **test:** give lazy admin open-houses lookups an explicit timeout ([bdb873e](https://github.com/maiprop/maiprop-listing-site/commit/bdb873e94a108e2beb025d339bda8b71800e5c52))
* **test:** ignore psql headers in TAP result counts ([#632](https://github.com/maiprop/maiprop-listing-site/issues/632)) ([61c9e11](https://github.com/maiprop/maiprop-listing-site/commit/61c9e11a15e632cfb8eccbd700e06fbf7e9920b6))
* **test:** restore exact catalogue pgTAP plan ([#631](https://github.com/maiprop/maiprop-listing-site/issues/631)) ([d3cbbf0](https://github.com/maiprop/maiprop-listing-site/commit/d3cbbf04c431c39624f78578f780ca630b68af11))
* **test:** use pathToFileURL for advisor index import test on Windows ([c2cfc88](https://github.com/maiprop/maiprop-listing-site/commit/c2cfc88598b42842b9a5dca65a230d8d92dfe560))
* tolerate upstream outages in deploy smoke ([2201cb1](https://github.com/maiprop/maiprop-listing-site/commit/2201cb19030dd04db1f3a2787ec6534d241f8443))
* trim catalogue expression diagnostics ([#619](https://github.com/maiprop/maiprop-listing-site/issues/619)) ([100e1af](https://github.com/maiprop/maiprop-listing-site/commit/100e1af507386ccda395d670195280c0324e18bd))
* **types:** remove billing type debt ([60bc779](https://github.com/maiprop/maiprop-listing-site/commit/60bc7798b7ce4ec9bfadbc750dfecf80cc93fa6f))
* **types:** sync staging auction RPC schema ([191d91a](https://github.com/maiprop/maiprop-listing-site/commit/191d91ae92800ccf4a91f6b37d01188de20d27b6))
* use valid Mapbox geocoding address types ([19fa0b1](https://github.com/maiprop/maiprop-listing-site/commit/19fa0b13a552cd3a7bbb1362d9ac80b47a6bcc71))
* validate returned scheduled dispatch IDs for every decision ([1d08a13](https://github.com/maiprop/maiprop-listing-site/commit/1d08a136485f0d09e66ec12cd97dce1637a2a9cd))
* verify durable checkout outcomes ([d7ce4dd](https://github.com/maiprop/maiprop-listing-site/commit/d7ce4ddd697960d34e7fdaccaa84c4fb5d03366f))
* verify static marker for catalogue hotfix ([6bce527](https://github.com/maiprop/maiprop-listing-site/commit/6bce527e0cfcac5240baef2b8a4f4218fb2c5e40))
* **viewings:** restore authenticated create visibility ([faa7e13](https://github.com/maiprop/maiprop-listing-site/commit/faa7e13a1dfe9a650da78792f51b8cb96659ee27))
* wait for temporary database login readiness ([7a4c240](https://github.com/maiprop/maiprop-listing-site/commit/7a4c240f90ea81d7d6f61737c2358d724a087db4))
* widen coordinate-backed location search ([4f1c597](https://github.com/maiprop/maiprop-listing-site/commit/4f1c59722ee57ecaf0cdff4a7cca21567137483f))


### Performance Improvements

* **admin:** avoid duplicate proof-of-funds loads ([eecf0f7](https://github.com/maiprop/maiprop-listing-site/commit/eecf0f7ab93256a189859f487158d1c7bd0e9fcc))
* bypass Pages Functions for static SPA routes ([#626](https://github.com/maiprop/maiprop-listing-site/issues/626)) ([5cf9ba4](https://github.com/maiprop/maiprop-listing-site/commit/5cf9ba49eafdc19d2e8746bc877f33b08bad0dae))
* embed initial catalogue during production builds ([#628](https://github.com/maiprop/maiprop-listing-site/issues/628)) ([786c6bf](https://github.com/maiprop/maiprop-listing-site/commit/786c6bfbec7633c8a2a601947bf0f6da3b524eeb))
* improve public listings first paint ([7e70062](https://github.com/maiprop/maiprop-listing-site/commit/7e7006230ca3ddc97eb9dd9051671fc15bfffb06))
* optimize homepage first paint ([163f065](https://github.com/maiprop/maiprop-listing-site/commit/163f06513c3b4d48634eea2e649b2ed6063194e2))
* optimize public data loading and valuation ([dfcaf5a](https://github.com/maiprop/maiprop-listing-site/commit/dfcaf5a4b7fe9613530d6c063382333881322a60))
* reduce listing search request churn ([d0e95bf](https://github.com/maiprop/maiprop-listing-site/commit/d0e95bfb6ee1d62e4e6887e1b7ae5bb732094a3c))

## [1.12.15](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.14...v1.12.15) (2026-07-19)


### Bug Fixes

* harden catalogue cache and promotion reporting ([#544](https://github.com/maiprop/maiprop-listing-site/issues/544)) ([b5f9dc7](https://github.com/maiprop/maiprop-listing-site/commit/b5f9dc74eec3e3eabf93fe6d61c6389c4cab0420))
* integrate verified worktree improvements ([#545](https://github.com/maiprop/maiprop-listing-site/issues/545)) ([cc5fb1b](https://github.com/maiprop/maiprop-listing-site/commit/cc5fb1bb310e946a1228bbb6af4d51dc9a7b8ac9))
* rotate poisoned public catalogue cache ([#542](https://github.com/maiprop/maiprop-listing-site/issues/542)) ([fce87ec](https://github.com/maiprop/maiprop-listing-site/commit/fce87ec249373741a386d666b700468678df62ff))

## [1.12.14](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.13...v1.12.14) (2026-07-18)


### Bug Fixes

* harden entitlements, messaging, and report workflows ([#534](https://github.com/maiprop/maiprop-listing-site/issues/534)) ([88b513d](https://github.com/maiprop/maiprop-listing-site/commit/88b513d4bf9c4a8b9d49df08df07d666675f9672))
* integrate pricing, address, rental valuation, and mobile corrections ([#541](https://github.com/maiprop/maiprop-listing-site/issues/541)) ([a864a72](https://github.com/maiprop/maiprop-listing-site/commit/a864a72d2bfc207d29d539fbdf23ec85662fe281))
* make new-build AI insights user-triggered ([#536](https://github.com/maiprop/maiprop-listing-site/issues/536)) ([d8da42e](https://github.com/maiprop/maiprop-listing-site/commit/d8da42ec879e3671d7ed925e70dbb11d97336afd))
* persist public API cache entries ([#531](https://github.com/maiprop/maiprop-listing-site/issues/531)) ([39e56e7](https://github.com/maiprop/maiprop-listing-site/commit/39e56e7ba677fb966ccaf4199898b2b66e94700e))
* restore homepage open houses and bound catalogue latency ([#533](https://github.com/maiprop/maiprop-listing-site/issues/533)) ([dc14e25](https://github.com/maiprop/maiprop-listing-site/commit/dc14e25548c702ce43be81e1239dff4a65aab3f9))
* show owner listings in promotion admin ([#532](https://github.com/maiprop/maiprop-listing-site/issues/532)) ([f4ba1e8](https://github.com/maiprop/maiprop-listing-site/commit/f4ba1e8e40ee114a00f44f25f2b3dc2705772c76))
* stabilize empty spotlight delivery ([#529](https://github.com/maiprop/maiprop-listing-site/issues/529)) ([afe3946](https://github.com/maiprop/maiprop-listing-site/commit/afe394610b3e0c818ea5ca327e7347007d9e7bcd))

## [1.12.13](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.12...v1.12.13) (2026-07-15)


### Bug Fixes

* recover poisoned public cache entries ([#527](https://github.com/maiprop/maiprop-listing-site/issues/527)) ([c8f2f90](https://github.com/maiprop/maiprop-listing-site/commit/c8f2f90089694ee0998b9089c51a0950637f8581))

## [1.12.12](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.11...v1.12.12) (2026-07-15)


### Bug Fixes

* allow empty spotlight deployments ([#525](https://github.com/maiprop/maiprop-listing-site/issues/525)) ([1adbb46](https://github.com/maiprop/maiprop-listing-site/commit/1adbb460c76bea99fbf4e8006d752e9b8ee811d2))

## [1.12.11](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.10...v1.12.11) (2026-07-15)


### Bug Fixes

* accelerate initial listing catalogue paint ([#519](https://github.com/maiprop/maiprop-listing-site/issues/519)) ([1666a39](https://github.com/maiprop/maiprop-listing-site/commit/1666a392d9cbd305502ad3cb64b7435f716abad4))
* enforce paid listing promotion entitlements ([70e5ffe](https://github.com/maiprop/maiprop-listing-site/commit/70e5ffe96f11410758161ceb7d2b31b2c4d71171))
* stabilize catalogue deploys and message deep links ([6029698](https://github.com/maiprop/maiprop-listing-site/commit/602969857c11c3ad5438ac69aa599bb6a80cd2ea))

## [1.12.10](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.9...v1.12.10) (2026-07-13)


### Bug Fixes

* publish release checks asynchronously ([#512](https://github.com/maiprop/maiprop-listing-site/issues/512)) ([a0b19ac](https://github.com/maiprop/maiprop-listing-site/commit/a0b19acfad116c4a150aa5b3f0b8cb13724ede3c))

## [1.12.9](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.8...v1.12.9) (2026-07-13)


### Bug Fixes

* bound listings location passive search fallback ([#497](https://github.com/maiprop/maiprop-listing-site/issues/497)) ([090eb37](https://github.com/maiprop/maiprop-listing-site/commit/090eb379b870a6b7a2c45bd258d1a599ce8e789a))
* broaden locality address search radius ([cb83aa9](https://github.com/maiprop/maiprop-listing-site/commit/cb83aa9f39527516eb93785b92eaa722c6f3e9c0))
* commit ranked location suggestions ([089f38a](https://github.com/maiprop/maiprop-listing-site/commit/089f38a37f8892c819594bd7a05387889ed8f418))
* complete free ECAS B-grade hardening ([#506](https://github.com/maiprop/maiprop-listing-site/issues/506)) ([4097fee](https://github.com/maiprop/maiprop-listing-site/commit/4097fee723668fecb3b2f7426dab5f9df7786e21))
* filter address fallbacks by typed context ([94a8d72](https://github.com/maiprop/maiprop-listing-site/commit/94a8d72c917d176cd8cc51f4157b1b3ae1db99e2))
* provide release CI repository context ([#510](https://github.com/maiprop/maiprop-listing-site/issues/510)) ([32ba413](https://github.com/maiprop/maiprop-listing-site/commit/32ba41386c3657fe28bbc18b9b098251ec5109cf))
* rank listing address suggestions by location context ([7d4abb4](https://github.com/maiprop/maiprop-listing-site/commit/7d4abb494a18804c3ed94e70872a1adbc2515b8e))
* rank visible listing address suggestions ([d998214](https://github.com/maiprop/maiprop-listing-site/commit/d99821417b03a072803248fb1f929beb1e8fabba))
* resolve street-number location suggestions ([#498](https://github.com/maiprop/maiprop-listing-site/issues/498)) ([aae8309](https://github.com/maiprop/maiprop-listing-site/commit/aae8309834df6206099a53d1694e1026957b4c37))
* restore public project API access ([#507](https://github.com/maiprop/maiprop-listing-site/issues/507)) ([178365b](https://github.com/maiprop/maiprop-listing-site/commit/178365b9cd869b7f7d86aecefb08ddb4eacf5b04))
* stabilize compare valuation workflow ([#511](https://github.com/maiprop/maiprop-listing-site/issues/511)) ([1629a24](https://github.com/maiprop/maiprop-listing-site/commit/1629a247ed6fda9ea45e0edec0659ec39eb78292))
* synchronize production Supabase types ([#508](https://github.com/maiprop/maiprop-listing-site/issues/508)) ([a8154b6](https://github.com/maiprop/maiprop-listing-site/commit/a8154b69e89806fbde062b6a12442b5d54dc5ea8))
* use valid Mapbox geocoding address types ([19fa0b1](https://github.com/maiprop/maiprop-listing-site/commit/19fa0b13a552cd3a7bbb1362d9ac80b47a6bcc71))
* widen coordinate-backed location search ([4f1c597](https://github.com/maiprop/maiprop-listing-site/commit/4f1c59722ee57ecaf0cdff4a7cca21567137483f))


### Performance Improvements

* improve public listings first paint ([7e70062](https://github.com/maiprop/maiprop-listing-site/commit/7e7006230ca3ddc97eb9dd9051671fc15bfffb06))
* optimize public data loading and valuation ([dfcaf5a](https://github.com/maiprop/maiprop-listing-site/commit/dfcaf5a4b7fe9613530d6c063382333881322a60))
* reduce listing search request churn ([d0e95bf](https://github.com/maiprop/maiprop-listing-site/commit/d0e95bfb6ee1d62e4e6887e1b7ae5bb732094a3c))

## [1.12.8](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.7...v1.12.8) (2026-07-10)


### Bug Fixes

* avoid deep Stripe invoice expansions ([#491](https://github.com/maiprop/maiprop-listing-site/issues/491)) ([ee3cec8](https://github.com/maiprop/maiprop-listing-site/commit/ee3cec8b0a40407fb7977e0f63efb857eec62ebb))
* fallback address suggestions to locality ([#486](https://github.com/maiprop/maiprop-listing-site/issues/486)) ([4c4f838](https://github.com/maiprop/maiprop-listing-site/commit/4c4f838151f9604720869cde254ee7a30d1846ab))
* group location search synonym filters ([#488](https://github.com/maiprop/maiprop-listing-site/issues/488)) ([56a9c00](https://github.com/maiprop/maiprop-listing-site/commit/56a9c00f4afaf1152e9c6e19d3ebd5005682b56e))
* ignore missing listing location coordinates ([3089b98](https://github.com/maiprop/maiprop-listing-site/commit/3089b9800e9a9b9ecf83b68d625a10d7b1c117b4))
* retry homepage initial fallback fetches ([#489](https://github.com/maiprop/maiprop-listing-site/issues/489)) ([cb48311](https://github.com/maiprop/maiprop-listing-site/commit/cb48311f451fd118e6762d7cce2970b44ab08d28))
* route listing detail previews through pages functions ([#485](https://github.com/maiprop/maiprop-listing-site/issues/485)) ([f140579](https://github.com/maiprop/maiprop-listing-site/commit/f140579871ccdb69f6a4bd9e63cac8c6ec6e3b9d))
* skip staging DB advisors for function-only changes ([#492](https://github.com/maiprop/maiprop-listing-site/issues/492)) ([a938397](https://github.com/maiprop/maiprop-listing-site/commit/a938397fd03eb1aa8f6f21f9ef0d3a58e43fc8a7))

## [1.12.7](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.6...v1.12.7) (2026-07-09)


### Bug Fixes

* refresh live Supabase types ([76f4244](https://github.com/maiprop/maiprop-listing-site/commit/76f4244f1a5867d1519b063a1fd6081b549a6f63))

## [1.12.6](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.5...v1.12.6) (2026-07-09)


### Bug Fixes

* harden address autocomplete and stripe runtime ([68db888](https://github.com/maiprop/maiprop-listing-site/commit/68db8881e7fa545bd904286abc55a7a4352055c2))

## [1.12.5](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.4...v1.12.5) (2026-07-04)


### Bug Fixes

* harden address autocomplete experience ([#470](https://github.com/maiprop/maiprop-listing-site/issues/470)) ([134b4bb](https://github.com/maiprop/maiprop-listing-site/commit/134b4bb1f24b4393ddfb58b375a9e1e26c74f43d))
* harden ecas billing and deployment evidence ([ff90ab5](https://github.com/maiprop/maiprop-listing-site/commit/ff90ab5703495777e41607f2086b1544b13838bf))
* stabilize address autocomplete ([dde33e1](https://github.com/maiprop/maiprop-listing-site/commit/dde33e114ebaf27088cbec5a9771f69f42e96c44))
* stabilize auction detail e2e wait ([586d0b1](https://github.com/maiprop/maiprop-listing-site/commit/586d0b1a027d00ce9385a7a5ebd87024591a2f4a))
* sync live supabase generated types ([1a2ba16](https://github.com/maiprop/maiprop-listing-site/commit/1a2ba167381e07ea898332e155251a735414a282))

## [1.12.4](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.3...v1.12.4) (2026-07-03)


### Bug Fixes

* harden homepage initial payload fallback ([0852fca](https://github.com/maiprop/maiprop-listing-site/commit/0852fcada0339b8d59cdc5681ab3e37cfc5584af))

## [1.12.3](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.2...v1.12.3) (2026-07-03)


### Bug Fixes

* harden ecas ui and supabase release wiring ([d9d88e0](https://github.com/maiprop/maiprop-listing-site/commit/d9d88e05868999cb4e54f485de758141547aa98a))
* normalize Supabase types and project policy drift ([c106700](https://github.com/maiprop/maiprop-listing-site/commit/c10670090edba4259a295434b323c744459a1323))

## [1.12.2](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.1...v1.12.2) (2026-07-02)


### Bug Fixes

* harden ecas ux valuation and deployment checks ([ef5f237](https://github.com/maiprop/maiprop-listing-site/commit/ef5f2375885da799b61b3a962aa4c3156092eccd))
* harden main ecas evidence and responsiveness ([#453](https://github.com/maiprop/maiprop-listing-site/issues/453)) ([26372c3](https://github.com/maiprop/maiprop-listing-site/commit/26372c3a90b6a1fcb988622bfde8fc202c5483b7))
* refresh production supabase generated types ([00b3bb2](https://github.com/maiprop/maiprop-listing-site/commit/00b3bb26302de5e81658f59185259333854772e7))

## [1.12.1](https://github.com/maiprop/maiprop-listing-site/compare/v1.12.0...v1.12.1) (2026-07-01)


### Bug Fixes

* make stripe catalog metadata sql rerunnable ([e0deeee](https://github.com/maiprop/maiprop-listing-site/commit/e0deeee7d8c628454ef40d2c952651734b793069))

## [1.12.0](https://github.com/maiprop/maiprop-listing-site/compare/v1.11.8...v1.12.0) (2026-07-01)


### Features

* **billing:** complete stripe integration ([0a76cd6](https://github.com/maiprop/maiprop-listing-site/commit/0a76cd6f8c06372f53699fd4db655bbf1969976b))


### Bug Fixes

* **edge:** satisfy invoice deno check ([3c33b4f](https://github.com/maiprop/maiprop-listing-site/commit/3c33b4f7aaf58f94453679ac39cdafa43449ec1f))
* finalize billing promotions and deploy checks ([5f6c69a](https://github.com/maiprop/maiprop-listing-site/commit/5f6c69a61162da90949bffbee850d74e6136c280))
* finalize stripe billing release wiring ([288c576](https://github.com/maiprop/maiprop-listing-site/commit/288c5768c7863ec8583c3777a19bf24de0c21bf5))
* **governance:** document billing function boundaries ([89a6d12](https://github.com/maiprop/maiprop-listing-site/commit/89a6d12c9c22704abfdf9b76faa32b1f9c425516))
* harden main ecas readiness ([bce7062](https://github.com/maiprop/maiprop-listing-site/commit/bce70620b8d859832af918cf88102fe83c734502))
* **migrations:** remove duplicate reconciliation placeholders ([b076bd0](https://github.com/maiprop/maiprop-listing-site/commit/b076bd06de4965e2da0b5fd572847b6fc6c58492))
* **migrations:** update reconciliation compatibility test ([877fede](https://github.com/maiprop/maiprop-listing-site/commit/877fede97658e15aaafb7c22a0e00bb6052a72db))
* restore mobile new-build signup flows ([d766500](https://github.com/maiprop/maiprop-listing-site/commit/d76650004a8638b7c904411aa9ec2a40bd98c5a3))
* **supabase:** refresh generated types ([f18d25d](https://github.com/maiprop/maiprop-listing-site/commit/f18d25d56b8346eb329113d135975431a543774b))
* **types:** remove billing type debt ([60bc779](https://github.com/maiprop/maiprop-listing-site/commit/60bc7798b7ce4ec9bfadbc750dfecf80cc93fa6f))


### Performance Improvements

* optimize homepage first paint ([163f065](https://github.com/maiprop/maiprop-listing-site/commit/163f06513c3b4d48634eea2e649b2ed6063194e2))

## [1.11.8](https://github.com/maiprop/maiprop-listing-site/compare/v1.11.7...v1.11.8) (2026-06-29)


### Bug Fixes

* refresh live Supabase generated types ([f844829](https://github.com/maiprop/maiprop-listing-site/commit/f844829ec2814335c3cd3c2bf6d6d81e57945a6d))
* tolerate upstream outages in deploy smoke ([2201cb1](https://github.com/maiprop/maiprop-listing-site/commit/2201cb19030dd04db1f3a2787ec6534d241f8443))

## [1.11.7](https://github.com/maiprop/maiprop-listing-site/compare/v1.11.6...v1.11.7) (2026-06-29)


### Bug Fixes

* refresh live Supabase types ([82890d9](https://github.com/maiprop/maiprop-listing-site/commit/82890d9c72e9ce4e2fcfcac9db09f8353427c381))

## [1.11.6](https://github.com/maiprop/maiprop-listing-site/compare/v1.11.5...v1.11.6) (2026-06-28)


### Bug Fixes

* clear live Supabase advisor drift ([8fa5fe1](https://github.com/maiprop/maiprop-listing-site/commit/8fa5fe1797e1232d23724a804f06123445b648b7))
* reconcile production migration history ([c7dcc32](https://github.com/maiprop/maiprop-listing-site/commit/c7dcc32907f7aff7aa91f93c343072b4ad1eace3))
* refresh live Supabase types ([b3a68e2](https://github.com/maiprop/maiprop-listing-site/commit/b3a68e2bd9505f6086b73f285f3b27745c0a903a))
* restore investor payment edge function source ([b4b9075](https://github.com/maiprop/maiprop-listing-site/commit/b4b9075c753d9c9fc63becbb1f0e0544b88b9ff8))

## [1.11.5](https://github.com/maiprop/maiprop-listing-site/compare/v1.11.4...v1.11.5) (2026-06-28)


### Bug Fixes

* resolve live UX regression paths ([3e47d80](https://github.com/maiprop/maiprop-listing-site/commit/3e47d805ea8509ba38de03bf60df5b9111572994))

## [1.11.4](https://github.com/maiprop/maiprop-listing-site/compare/v1.11.3...v1.11.4) (2026-06-28)


### Bug Fixes

* harden public listings load path ([fbeb6e0](https://github.com/maiprop/maiprop-listing-site/commit/fbeb6e0807a3fb09241972167bee5d7f4f7ad180))
* improve homepage inventory loading ([bf33ad2](https://github.com/maiprop/maiprop-listing-site/commit/bf33ad2b53a44fca2d6c169edd757a81563f3ed1))
* reduce ai quota status latency ([de528c7](https://github.com/maiprop/maiprop-listing-site/commit/de528c73ecefff9b9ed02f920508772ea07c276f))

## [1.11.3](https://github.com/maiprop/maiprop-listing-site/compare/v1.11.2...v1.11.3) (2026-06-23)


### Bug Fixes

* stabilize live operational smoke ([#411](https://github.com/maiprop/maiprop-listing-site/issues/411)) ([6591e66](https://github.com/maiprop/maiprop-listing-site/commit/6591e66e7c75ccdff600c667c1f75ce1555f8511))
* stabilize live professional smoke and CI security gates ([88dbb47](https://github.com/maiprop/maiprop-listing-site/commit/88dbb479e324ff40b7d702d664942e095c337913))

## [1.11.2](https://github.com/maiprop/maiprop-listing-site/compare/v1.11.1...v1.11.2) (2026-06-23)


### Bug Fixes

* harden homepage public api latency ([25fa8d8](https://github.com/maiprop/maiprop-listing-site/commit/25fa8d8bf6c7418fb670aa10fc6444878bec791d))

## [1.11.1](https://github.com/maiprop/maiprop-listing-site/compare/v1.11.0...v1.11.1) (2026-06-22)


### Bug Fixes

* harden edge request validation ([b66889a](https://github.com/maiprop/maiprop-listing-site/commit/b66889a6aff04ebecd7a60b80207002d954d4257))

## [1.11.0](https://github.com/maiprop/maiprop-listing-site/compare/v1.10.0...v1.11.0) (2026-06-22)


### Features

* route project writes through edge boundary ([f8092d0](https://github.com/maiprop/maiprop-listing-site/commit/f8092d02357ce8481670f33cd04d571264578e4d))

## [1.10.0](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.31...v1.10.0) (2026-06-22)


### Features

* harden phase 1-8 mutation boundaries ([02b0fd1](https://github.com/maiprop/maiprop-listing-site/commit/02b0fd16b1c14ae2fed95b97f1e65291286bc223))
* move new-build creation behind edge boundary ([#397](https://github.com/maiprop/maiprop-listing-site/issues/397)) ([008b65a](https://github.com/maiprop/maiprop-listing-site/commit/008b65aa38c28332024ead48230d50d3c3eccd0b))

## [1.9.31](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.30...v1.9.31) (2026-06-21)


### Bug Fixes

* remove esm supabase dependency from edge checks ([98889b9](https://github.com/maiprop/maiprop-listing-site/commit/98889b965e5316b729799f1858a8a6965a3c4d28))

## [1.9.30](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.29...v1.9.30) (2026-06-21)


### Bug Fixes

* add public listing failover fallbacks ([9a54732](https://github.com/maiprop/maiprop-listing-site/commit/9a54732ec319ee0be3ba7e5482dce91f9c33da64))

## [1.9.29](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.28...v1.9.29) (2026-06-21)


### Bug Fixes

* align cloudflare production branch ([#382](https://github.com/maiprop/maiprop-listing-site/issues/382)) ([c18087f](https://github.com/maiprop/maiprop-listing-site/commit/c18087f66810a3c2713d2abc032cdb56153f73fc))
* deploy cloudflare pages to production ([#381](https://github.com/maiprop/maiprop-listing-site/issues/381)) ([741df4c](https://github.com/maiprop/maiprop-listing-site/commit/741df4ca8984d606e7ad51bf76ad98352a73ed7e))
* deploy cloudflare production alias ([#383](https://github.com/maiprop/maiprop-listing-site/issues/383)) ([3988d2d](https://github.com/maiprop/maiprop-listing-site/commit/3988d2d77becd05294266cc3f238a3531a4bd0b1))
* harden cloudflare stable deploy checks ([#385](https://github.com/maiprop/maiprop-listing-site/issues/385)) ([efcca4f](https://github.com/maiprop/maiprop-listing-site/commit/efcca4f3055091b572b5309f0254c61c68be99a7))
* package cloudflare pages worker ([#384](https://github.com/maiprop/maiprop-listing-site/issues/384)) ([8a8fb6b](https://github.com/maiprop/maiprop-listing-site/commit/8a8fb6bbbf2f651824280d8f034e8a164549aa49))
* route cloudflare pages functions ([#379](https://github.com/maiprop/maiprop-listing-site/issues/379)) ([fa2033d](https://github.com/maiprop/maiprop-listing-site/commit/fa2033df7a4af35d039a6b25721b839d57ac9129))
* stabilize auth email hook dependency ([#386](https://github.com/maiprop/maiprop-listing-site/issues/386)) ([376b63a](https://github.com/maiprop/maiprop-listing-site/commit/376b63ad831e4cb38b05825e9953d84706ef72a4))

## [1.9.28](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.27...v1.9.28) (2026-06-19)


### Performance Improvements

* optimize listing grid responsiveness ([9e9c17f](https://github.com/maiprop/maiprop-listing-site/commit/9e9c17f88ada584e693c528bd54fd4228aee6ed4))

## [1.9.27](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.26...v1.9.27) (2026-06-18)


### Bug Fixes

* avoid apt psql install in migration replay ([f40888e](https://github.com/maiprop/maiprop-listing-site/commit/f40888e6a7f0b9888ca0baab2010cabcbeaeffb2))
* avoid plan-gated attestation storage ([#362](https://github.com/maiprop/maiprop-listing-site/issues/362)) ([40c5e36](https://github.com/maiprop/maiprop-listing-site/commit/40c5e36057766358a1f8fe4ffc3b5b2a1140d7c6))
* grant deploy provenance permissions ([#359](https://github.com/maiprop/maiprop-listing-site/issues/359)) ([0f05c84](https://github.com/maiprop/maiprop-listing-site/commit/0f05c84a4cdb18b9d9008438a759143d8cdf6c46))
* make build attestation best effort ([7bd6f24](https://github.com/maiprop/maiprop-listing-site/commit/7bd6f24677d52788786b749d1d7758564accf572))

## [1.9.26](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.25...v1.9.26) (2026-06-16)


### Bug Fixes

* resolve dependabot npm alerts ([d53a13b](https://github.com/maiprop/maiprop-listing-site/commit/d53a13b5cb43576589c004f1d0cfed9da5a47e94))

## [1.9.25](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.24...v1.9.25) (2026-06-16)


### Bug Fixes

* allow project ad cover replacement ([0fec323](https://github.com/maiprop/maiprop-listing-site/commit/0fec323449802d105d3d3c60b1f62f386e500963))
* harden open house and new-build flows ([2945d5a](https://github.com/maiprop/maiprop-listing-site/commit/2945d5ad399bca874281e006f1b7d9d2afcd709a))
* improve mobile registration and auth loading ([#343](https://github.com/maiprop/maiprop-listing-site/issues/343)) ([d55a0c1](https://github.com/maiprop/maiprop-listing-site/commit/d55a0c1e0260e3768a892b4dfa894568ebf1a49e))
* preserve Supabase client binding in open-house flows ([0455313](https://github.com/maiprop/maiprop-listing-site/commit/045531357a7b29f0eaecdf5d47220f32c391d1af))
* standardize listing card layout ([a974fab](https://github.com/maiprop/maiprop-listing-site/commit/a974fabef6191f223239befea489ab363a584a7c))
* sync stale branch listing fixes ([#351](https://github.com/maiprop/maiprop-listing-site/issues/351)) ([2828900](https://github.com/maiprop/maiprop-listing-site/commit/2828900cc0e2e96fc9fb57b4ae689a44e4228969))


### Performance Improvements

* reduce listings cold TTFB ([39ec3b2](https://github.com/maiprop/maiprop-listing-site/commit/39ec3b2b61fee5a927390c0ebaced274dab9ae1a))

## [1.9.24](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.23...v1.9.24) (2026-06-15)


### Bug Fixes

* improve open house and auction listing UX ([#335](https://github.com/maiprop/maiprop-listing-site/issues/335)) ([d6ba188](https://github.com/maiprop/maiprop-listing-site/commit/d6ba18870550b04dd2da68bd4650071d96d1f16d))
* wire open house ownership and new-build contact ([75f16b5](https://github.com/maiprop/maiprop-listing-site/commit/75f16b57a8f78c40fc342322697d89556e2c0f58))


### Performance Improvements

* defer property detail AI calls ([#334](https://github.com/maiprop/maiprop-listing-site/issues/334)) ([fb09a95](https://github.com/maiprop/maiprop-listing-site/commit/fb09a956566029ce71e8096ed3b60a2b449b4b58))

## [1.9.23](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.22...v1.9.23) (2026-06-14)


### Bug Fixes

* harden analytics open house and ecas gates ([#327](https://github.com/maiprop/maiprop-listing-site/issues/327)) ([1dbfbae](https://github.com/maiprop/maiprop-listing-site/commit/1dbfbaea82dc3d8faefdbf6f06fa6eb80f7b43ef))
* simplify new build project flow ([90705c8](https://github.com/maiprop/maiprop-listing-site/commit/90705c8e0505a08d4bcc013fc6ce2ad39af7341a))
* tolerate Supabase IPv6 index stat outages ([f51dad1](https://github.com/maiprop/maiprop-listing-site/commit/f51dad1ebfa5c8ae28a915a38c3221447f74655b))
* unblock release safety checks ([cebeb86](https://github.com/maiprop/maiprop-listing-site/commit/cebeb868a80bdd44dba087714f5697157937e1a3))

## [1.9.22](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.21...v1.9.22) (2026-06-13)


### Bug Fixes

* repair listing media and classification flows ([#322](https://github.com/maiprop/maiprop-listing-site/issues/322)) ([f28192d](https://github.com/maiprop/maiprop-listing-site/commit/f28192dd82896e067b4225fae00192937ece8115))
* use gpt-5.4 mini for ai insights ([#320](https://github.com/maiprop/maiprop-listing-site/issues/320)) ([40e4ebe](https://github.com/maiprop/maiprop-listing-site/commit/40e4ebe456bcf606e566c30fa171716455f29cba))

## [1.9.21](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.20...v1.9.21) (2026-06-12)


### Bug Fixes

* detach project listings as standalone ads ([92e762a](https://github.com/maiprop/maiprop-listing-site/commit/92e762a4abea8af1c6c1bd987556c618775af1ef))

## [1.9.20](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.19...v1.9.20) (2026-06-12)


### Bug Fixes

* enforce developer-only new build listings ([2fcfc01](https://github.com/maiprop/maiprop-listing-site/commit/2fcfc017941a45f14259c6bdd2326074b37a6a7d))
* salvage stale advisor index cleanup ([#316](https://github.com/maiprop/maiprop-listing-site/issues/316)) ([e685657](https://github.com/maiprop/maiprop-listing-site/commit/e6856574151d2e5db387250def7ba1fb4cc00513))
* source-control project delete migration ([#317](https://github.com/maiprop/maiprop-listing-site/issues/317)) ([0e437d2](https://github.com/maiprop/maiprop-listing-site/commit/0e437d27b454a2f60fa3c4c95ec107c510df2e0d))

## [1.9.19](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.18...v1.9.19) (2026-06-12)


### Bug Fixes

* canonicalize project listing types ([#312](https://github.com/maiprop/maiprop-listing-site/issues/312)) ([018bba6](https://github.com/maiprop/maiprop-listing-site/commit/018bba6ac48d1d75ff147adeae6d808647273bdd))

## [1.9.18](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.17...v1.9.18) (2026-06-12)


### Bug Fixes

* harden audit findings and listing media flows ([#310](https://github.com/maiprop/maiprop-listing-site/issues/310)) ([e3f8261](https://github.com/maiprop/maiprop-listing-site/commit/e3f82614bb1b6938a6307195a11d25967347d94f))

## [1.9.17](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.16...v1.9.17) (2026-06-12)


### Bug Fixes

* harden audit-critical ai and supabase paths ([d28e871](https://github.com/maiprop/maiprop-listing-site/commit/d28e871b2c3724acc9e2dbd1eae5e452eda55b25))

## [1.9.16](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.15...v1.9.16) (2026-06-11)


### Bug Fixes

* **ai:** normalize valuation and neighbourhood data ([3d8a1fe](https://github.com/maiprop/maiprop-listing-site/commit/3d8a1fe6e6ca569e9ae268a5750c1aedb8b575a2))
* canonicalize new-build listings and hybrid valuation ([17171e8](https://github.com/maiprop/maiprop-listing-site/commit/17171e8fc5476332e37d7f80130785328d4a7dd2))

## [1.9.15](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.14...v1.9.15) (2026-06-11)


### Bug Fixes

* wire AI insights and follow-up automation ([d58c390](https://github.com/maiprop/maiprop-listing-site/commit/d58c3900903776f3fad6a8c8d9967ea3951c4742))

## [1.9.14](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.13...v1.9.14) (2026-06-11)


### Bug Fixes

* clear stale project coords and harden quick sale ([#298](https://github.com/maiprop/maiprop-listing-site/issues/298)) ([27e6849](https://github.com/maiprop/maiprop-listing-site/commit/27e6849dbb3ae883cdd3a6042f8d1a898e203b74))
* keep listing detail loadable after uploads ([fff572e](https://github.com/maiprop/maiprop-listing-site/commit/fff572e81e3b4cb192b50aa858862d8d61a52d8e))
* keep renovated sale listings off new-build routes ([ea6af48](https://github.com/maiprop/maiprop-listing-site/commit/ea6af4867219d122083c1441b8cb79899223d871))
* polish location inputs and mobile property UX ([#300](https://github.com/maiprop/maiprop-listing-site/issues/300)) ([229937f](https://github.com/maiprop/maiprop-listing-site/commit/229937f4df6b871d20664cbbbe76160967ac191b))
* preserve listing maps and mobile property flows ([e46d966](https://github.com/maiprop/maiprop-listing-site/commit/e46d9668c63e425e7791708f1eb9f39844559819))
* preserve supabase edge client binding ([#290](https://github.com/maiprop/maiprop-listing-site/issues/290)) ([facd756](https://github.com/maiprop/maiprop-listing-site/commit/facd756218b2e0486710db78d47c92fe2583ea44))
* restore listing address suggestions ([b35c0ca](https://github.com/maiprop/maiprop-listing-site/commit/b35c0caad2a9f958b53cc079d717f75bd1f32228))

## [1.9.13](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.12...v1.9.13) (2026-06-05)


### Bug Fixes

* restore photo uploads ([#286](https://github.com/maiprop/maiprop-listing-site/issues/286)) ([83b759f](https://github.com/maiprop/maiprop-listing-site/commit/83b759f267b59cb4bdbe5b584bc202ed14bae76c))

## [1.9.12](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.11...v1.9.12) (2026-06-05)


### Bug Fixes

* degrade public api on transient upstream failures ([c7356ad](https://github.com/maiprop/maiprop-listing-site/commit/c7356ad28f74d94916851799540f79a359d621ed))
* fail fast when Supabase is unavailable ([edc3da7](https://github.com/maiprop/maiprop-listing-site/commit/edc3da742f4451b02be04e89b9ffda884aae9180))
* harden supabase and public api resilience ([46a8fbe](https://github.com/maiprop/maiprop-listing-site/commit/46a8fbe4ec63aa1a5e64d088327ee6ff40ce702b))
* keep function-only Supabase staging prep unblocked ([227da6e](https://github.com/maiprop/maiprop-listing-site/commit/227da6e59baf317f180e7426ddc82403484ae300))
* skip index stats when staging db credentials absent ([aa88b54](https://github.com/maiprop/maiprop-listing-site/commit/aa88b54426cc2730e34a66d3170344189897c5f0))
* tolerate transient advisor timeouts ([d41d7f7](https://github.com/maiprop/maiprop-listing-site/commit/d41d7f7d5af69654f0511a5522ebaf0690e214fd))
* tolerate transient index stats timeouts ([175ee0f](https://github.com/maiprop/maiprop-listing-site/commit/175ee0fb99b791ea303c36a127762895ba4b7b58))
* tolerate transient live security posture timeouts ([16c5370](https://github.com/maiprop/maiprop-listing-site/commit/16c5370f343246f357faa975bd44411f7426371a))
* tolerate transient type generation timeouts ([c47d30b](https://github.com/maiprop/maiprop-listing-site/commit/c47d30b6b0f9296d58378b3916b1a029256d0f68))

## [1.9.11](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.10...v1.9.11) (2026-06-04)


### Bug Fixes

* close pending hardening gates ([1ac0ec8](https://github.com/maiprop/maiprop-listing-site/commit/1ac0ec86f3abc4274a892f488c3f1fc45c9db7e8))
* delete production fixtures in dependency order ([08ceaae](https://github.com/maiprop/maiprop-listing-site/commit/08ceaae85fdc70ec70d864a1cc926fa50201973d))
* harden core business flows and auction sync ([5b077a5](https://github.com/maiprop/maiprop-listing-site/commit/5b077a5bf2905c0f622083c2eac83cad85bd7807))
* harden dashboard live flows ([#267](https://github.com/maiprop/maiprop-listing-site/issues/267)) ([5bee8f0](https://github.com/maiprop/maiprop-listing-site/commit/5bee8f03a7a4fb164d25f05e01e74cecc5175767))
* harden live auction and dashboard smoke checks ([#277](https://github.com/maiprop/maiprop-listing-site/issues/277)) ([dee770a](https://github.com/maiprop/maiprop-listing-site/commit/dee770a0ce516d9f01f07bb842a606e1023cbf8e))
* harden live flow coverage and developer listing gate ([b40d048](https://github.com/maiprop/maiprop-listing-site/commit/b40d048f359932aff985e1c5c2240b2608f8f5f6))
* harden preview deploy parity ([e5703b1](https://github.com/maiprop/maiprop-listing-site/commit/e5703b1910fd448b5fce5d81dcd146849e69e99a))
* harden release hygiene gates ([d6d3a46](https://github.com/maiprop/maiprop-listing-site/commit/d6d3a4696b78ebf93e185ef982e7567765bca391))
* harden Supabase index stats capture ([2f20931](https://github.com/maiprop/maiprop-listing-site/commit/2f209314d930d9df73f3cf45b8fe433c9c0c21cc))
* hide auction internals on cards ([#278](https://github.com/maiprop/maiprop-listing-site/issues/278)) ([697aa0e](https://github.com/maiprop/maiprop-listing-site/commit/697aa0e304e7623591b92c5ddfe881d749b3d42b))
* keep advisor gate running without DB stats secrets ([def7a32](https://github.com/maiprop/maiprop-listing-site/commit/def7a3299d30aa13e149d84f56dd9f4a9ed4ab9c))
* reconcile live migration smoke gates ([d657829](https://github.com/maiprop/maiprop-listing-site/commit/d65782985a6608532005cd7e691e2f3f99baa8c7))
* repair admin smoke role seed guard ([#276](https://github.com/maiprop/maiprop-listing-site/issues/276)) ([24422b9](https://github.com/maiprop/maiprop-listing-site/commit/24422b977dbed4b18489a3da59536bf422c908e6))
* require pro before investor access application ([#279](https://github.com/maiprop/maiprop-listing-site/issues/279)) ([7eb8b77](https://github.com/maiprop/maiprop-listing-site/commit/7eb8b77cbec23917a74508b887527010db3c51d4))
* stream coverage output in CI ([067ee76](https://github.com/maiprop/maiprop-listing-site/commit/067ee76dee2bbe23c440db487e1e0bc9fd0726c1))

## [1.9.10](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.9...v1.9.10) (2026-06-02)


### Bug Fixes

* harden supabase type freshness checks ([9cf1617](https://github.com/maiprop/maiprop-listing-site/commit/9cf161774c6fb4ab4c293700bddbed2db7c8afd1))

## [1.9.9](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.8...v1.9.9) (2026-06-02)


### Bug Fixes

* complete deployment audit hardening ([4937064](https://github.com/maiprop/maiprop-listing-site/commit/49370648a4357049f61b79a5856575ab0431b241))
* export OS property reports as HTML ([6aa4677](https://github.com/maiprop/maiprop-listing-site/commit/6aa4677a05dcb10c4ae78eb0b1c1cc8e974a5968))
* harden deployment health gates ([841a7b7](https://github.com/maiprop/maiprop-listing-site/commit/841a7b7622ce791e0685ddcdfa1dd00b15d96afc))
* harden security alerts and role-switch audit ([2281aac](https://github.com/maiprop/maiprop-listing-site/commit/2281aacb4da0dae661af586484f43320d74eeaae))
* harden Supabase staging bootstrap ([2a02186](https://github.com/maiprop/maiprop-listing-site/commit/2a02186b9ac72716fd4bf6bb001d05aa0369aeb1))
* lock down private listing visibility ([f574dab](https://github.com/maiprop/maiprop-listing-site/commit/f574dab46e5523009b2e0e3a4e570945a7bfe006))
* mobile location input suggestions glitch ([86db0ba](https://github.com/maiprop/maiprop-listing-site/commit/86db0baa9bd86e0af14151d38114592b98ca1400))
* repair location search a11y ([3b46f47](https://github.com/maiprop/maiprop-listing-site/commit/3b46f47e5d372e1acb50126e3aad4573e2afc1af))
* stabilize open houses layout ([#255](https://github.com/maiprop/maiprop-listing-site/issues/255)) ([f2aa28b](https://github.com/maiprop/maiprop-listing-site/commit/f2aa28bf7e38ddfbb6fab16cf4dc7afacae97ffd))
* surface auction floor details ([#254](https://github.com/maiprop/maiprop-listing-site/issues/254)) ([1e92ac4](https://github.com/maiprop/maiprop-listing-site/commit/1e92ac43e04e137c6be99c2528ab42a65ecc5a36))
* wire final location fields ([2c56816](https://github.com/maiprop/maiprop-listing-site/commit/2c56816b15f84400cb9de33b196b8f8c18086b6f))
* wire location suggestions ([002dd43](https://github.com/maiprop/maiprop-listing-site/commit/002dd43ef156261d75eb929a73920175c5282c5a))
* wire remaining location inputs ([dbd00b4](https://github.com/maiprop/maiprop-listing-site/commit/dbd00b47de97a6d15b49c1b33eafc6353ff8e40f))

## [1.9.8](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.7...v1.9.8) (2026-05-26)


### Bug Fixes

* scope video consultation rooms ([#233](https://github.com/maiprop/maiprop-listing-site/issues/233)) ([41f2c07](https://github.com/maiprop/maiprop-listing-site/commit/41f2c0788564e99828c46ad224ffa03f5c936c01))
* use current video room migration timestamp ([#235](https://github.com/maiprop/maiprop-listing-site/issues/235)) ([142a8b1](https://github.com/maiprop/maiprop-listing-site/commit/142a8b11ca50932c42f49447ead44a13e5b834a9))

## [1.9.7](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.6...v1.9.7) (2026-05-25)


### Bug Fixes

* notify audit and open house flows ([#212](https://github.com/maiprop/maiprop-listing-site/issues/212)) ([661d40a](https://github.com/maiprop/maiprop-listing-site/commit/661d40a6503eabaca7737e18506c85e9ab0c2bdc))
* unify lead capture and admin submissions ([#213](https://github.com/maiprop/maiprop-listing-site/issues/213)) ([b33edab](https://github.com/maiprop/maiprop-listing-site/commit/b33edabdda3de7334cb87da9d0e2b5f004e4a55d))

## [1.9.6](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.5...v1.9.6) (2026-05-25)


### Bug Fixes

* add host pof review controls ([#216](https://github.com/maiprop/maiprop-listing-site/issues/216)) ([949d9b8](https://github.com/maiprop/maiprop-listing-site/commit/949d9b8b162944ced7edb87f286183ae94357da1))
* allow safe CSP style attributes ([3f4bf50](https://github.com/maiprop/maiprop-listing-site/commit/3f4bf504fe0039a25902a558ad8e69ded7b6d59d))
* apply web fixes without mobile app ([16bb0fe](https://github.com/maiprop/maiprop-listing-site/commit/16bb0fe83cc794be4fe0d49e4669e03e4f92a5ea))
* avoid slow public auction OS fallback ([5c6634d](https://github.com/maiprop/maiprop-listing-site/commit/5c6634d5c7169796d983c528a145574c56fdb286))
* bootstrap new-build lead trigger table ([7e02768](https://github.com/maiprop/maiprop-listing-site/commit/7e027683dc0b1a0c32e04c8fbfe947727f1b5be8))
* capture new-build project leads ([02877d8](https://github.com/maiprop/maiprop-listing-site/commit/02877d8879333323ff1070cd887f9034dfd07692))
* clean audit findings and workflow guards ([#210](https://github.com/maiprop/maiprop-listing-site/issues/210)) ([4ffe800](https://github.com/maiprop/maiprop-listing-site/commit/4ffe8000244dac3cd54359178674b994408809bd))
* diversify public auction cache ([7675b3b](https://github.com/maiprop/maiprop-listing-site/commit/7675b3b0224e7dec6723f082c8a4582941652790))
* enforce remaining plan limits ([5fd6962](https://github.com/maiprop/maiprop-listing-site/commit/5fd696251691baca9e0727e38739347cac7ca029))
* harden cloudflare supabase runtime bindings ([aae25f4](https://github.com/maiprop/maiprop-listing-site/commit/aae25f40daf594415a0ec516c9e4fbbdb67dcafb))
* harden CSP and CI timeouts ([4360b44](https://github.com/maiprop/maiprop-listing-site/commit/4360b4495ea08455924055d5d7fcabb3a25f3a64))
* harden deployment readiness gates ([39ff255](https://github.com/maiprop/maiprop-listing-site/commit/39ff255ff9d1597b139229a333f2ad2ab1b68b12))
* harden live deployment smoke checks ([d0151f0](https://github.com/maiprop/maiprop-listing-site/commit/d0151f0b8d8ce14473fb43455179f0c01834beb4))
* harden role review and agent workflows ([60cc43b](https://github.com/maiprop/maiprop-listing-site/commit/60cc43b8ece0e54d9cddc67aeac338c273428077))
* harden subscription lifecycle gating ([e00d3b7](https://github.com/maiprop/maiprop-listing-site/commit/e00d3b78b8980fb781c497b80c7ae242f85a3ef4))
* harden video room authorization ([46287b3](https://github.com/maiprop/maiprop-listing-site/commit/46287b3ddd63719797cc13a699005c6a61f8b525))
* normalize viewing and consultation scheduling ([a029d65](https://github.com/maiprop/maiprop-listing-site/commit/a029d65d4b76ec752278c202255aae1528fdbd4d))
* order staging deploy before security checks ([#219](https://github.com/maiprop/maiprop-listing-site/issues/219)) ([6585efd](https://github.com/maiprop/maiprop-listing-site/commit/6585efd80947d7a3797f3c411d094b8cee1f9fd1))
* pass pages function vars through wrangler ([6cc00a5](https://github.com/maiprop/maiprop-listing-site/commit/6cc00a5720865a11f7e58051ab2ff54b7ea9dc7c))
* pin Cloudflare Pages output directory ([b22b3d7](https://github.com/maiprop/maiprop-listing-site/commit/b22b3d7d35cd26c4869b0ddf62c48108b4d2d693))
* polish Greek localization and auction routing ([8013c50](https://github.com/maiprop/maiprop-listing-site/commit/8013c50d0b0bdb0698685278e38ae0a5975b345f))
* polish localization and auction performance ([18860d6](https://github.com/maiprop/maiprop-listing-site/commit/18860d6c0bc9fd440c45471ebfd0bd68062e0258))
* refine greek pricing localization ([94f1537](https://github.com/maiprop/maiprop-listing-site/commit/94f1537c7f23b80ff4187739e4c04d460bfd28e1))
* repair main migration replay ([#218](https://github.com/maiprop/maiprop-listing-site/issues/218)) ([bfe3982](https://github.com/maiprop/maiprop-listing-site/commit/bfe39821962da982ee3127df4a24cd4ddf59486e))
* repair migration replay ordering ([196a640](https://github.com/maiprop/maiprop-listing-site/commit/196a6404e08bd5668f54590ca6aac6bcb955698d))
* restore bidirectional workflow fulfillment ([4fa3480](https://github.com/maiprop/maiprop-listing-site/commit/4fa3480391f2c4d8b76ed320a1e77560dc4e5b83))
* restore bidirectional workflow fulfillment ([7f5f936](https://github.com/maiprop/maiprop-listing-site/commit/7f5f936ed7ce35a5932b7a061ca1f03284412641))
* serve public auctions from cache first ([f015391](https://github.com/maiprop/maiprop-listing-site/commit/f01539199a392acd85107790a0a3697b8b668cec))
* speed up public auction national sampling ([861a3af](https://github.com/maiprop/maiprop-listing-site/commit/861a3af31951cb1476057ebd572b4c37cad13985))
* stabilize auction municipality rotation fallback ([c7ed113](https://github.com/maiprop/maiprop-listing-site/commit/c7ed11340f7ea4a08c9393b3b84c54af9a81c4f5))
* support production-only Supabase CI ([#221](https://github.com/maiprop/maiprop-listing-site/issues/221)) ([20e7314](https://github.com/maiprop/maiprop-listing-site/commit/20e7314539b418b204514ba5f050c85394eb555e))
* trigger supabase staging deploys ([3745afa](https://github.com/maiprop/maiprop-listing-site/commit/3745afa894e4fbed9ee62ea8dd29309e996fe240))
* use stable auction fallback page ([d9e1e72](https://github.com/maiprop/maiprop-listing-site/commit/d9e1e7297a11bfad7d1d51662238fc8acefbb1a3))
* wire interaction notifications ([2997231](https://github.com/maiprop/maiprop-listing-site/commit/2997231f89e3aba45684d302056eee0fa8197dda))
* wire interaction notifications ([d8de5eb](https://github.com/maiprop/maiprop-listing-site/commit/d8de5eb1daec41c04cf2376e34d285ff6781e76b))


### Performance Improvements

* improve public catalogue performance ([6a9ee70](https://github.com/maiprop/maiprop-listing-site/commit/6a9ee70d2dcd4ba04edd0bf3442b2305f4bd8db8))

## [1.9.5](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.4...v1.9.5) (2026-05-22)


### Bug Fixes

* align auction detail AI report gating ([9653887](https://github.com/maiprop/maiprop-listing-site/commit/9653887ce4c663d223945ff8de4a566776e65c87))
* live index trend colors ([9e07e0f](https://github.com/maiprop/maiprop-listing-site/commit/9e07e0fe55158325c1e46e708a7b6992f59af602))
* polish password requirement feedback ([b63cf88](https://github.com/maiprop/maiprop-listing-site/commit/b63cf887ff9ff639dcdb713c8efe5fb905bddf93))
* preserve auction RPC binding ([1288847](https://github.com/maiprop/maiprop-listing-site/commit/12888476e1122de718dd96f0f8fd9110b5d01668))
* show AI consumption in billing dashboard ([167cb80](https://github.com/maiprop/maiprop-listing-site/commit/167cb80472c9a1950f93f26a5907b71c692fc164))
* surface signup progress and failures ([9f9391e](https://github.com/maiprop/maiprop-listing-site/commit/9f9391ebd976f5facadc2fbba3d6c118c1d63c10))

## [1.9.4](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.3...v1.9.4) (2026-05-21)


### Bug Fixes

* **auctions:** randomize national OS sample ([0624abb](https://github.com/maiprop/maiprop-listing-site/commit/0624abbe7df51e810520c42ece3c425d2773f42c))
* gate open house valuation behind pro ([61a3fd0](https://github.com/maiprop/maiprop-listing-site/commit/61a3fd0c3412ce1c0855ce33b35fb59bcb472b38))
* **index:** improve market ticker palette and video startup ([#198](https://github.com/maiprop/maiprop-listing-site/issues/198)) ([925ab06](https://github.com/maiprop/maiprop-listing-site/commit/925ab0699237582a28f2da750c38adc67985285c))


### Performance Improvements

* defer Places search loading ([#199](https://github.com/maiprop/maiprop-listing-site/issues/199)) ([caa5a17](https://github.com/maiprop/maiprop-listing-site/commit/caa5a17104351deec41946d4aa5fb1daebd0e255))

## [1.9.3](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.2...v1.9.3) (2026-05-21)


### Bug Fixes

* harden AI quota and notification wiring ([#193](https://github.com/maiprop/maiprop-listing-site/issues/193)) ([03fde86](https://github.com/maiprop/maiprop-listing-site/commit/03fde8673de090c818dc45e5139ca00ccce8675f))

## [1.9.2](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.1...v1.9.2) (2026-05-20)


### Bug Fixes

* gate professional actions and meter AI insights ([7ef438d](https://github.com/maiprop/maiprop-listing-site/commit/7ef438d7501e1068346c09d9799915ec5b647cfc))
* keep neighbourhood report quota visible ([975bfdf](https://github.com/maiprop/maiprop-listing-site/commit/975bfdf3a141039fb7573eb1eed71bc692c28762))
* make map heatmap and area drawing consistent ([1c2177c](https://github.com/maiprop/maiprop-listing-site/commit/1c2177c47d09488320eb1c6993d9b2fa7385489a))
* prefer Street View for auction images ([d793086](https://github.com/maiprop/maiprop-listing-site/commit/d7930866e83d58e7e962210d07653ed48c07802c))
* show AI quota counters ([b7fb807](https://github.com/maiprop/maiprop-listing-site/commit/b7fb807689a2f9cc9b389278b13a9633dc6e2cbd))

## [1.9.1](https://github.com/maiprop/maiprop-listing-site/compare/v1.9.0...v1.9.1) (2026-05-19)


### Bug Fixes

* update vulnerable brace-expansion lockfile entries ([1fa6b5f](https://github.com/maiprop/maiprop-listing-site/commit/1fa6b5f50182c3d5ced7d943e7d0e737b5247e05))

## [1.9.0](https://github.com/maiprop/maiprop-listing-site/compare/v1.8.1...v1.9.0) (2026-05-18)


### Features

* incorporate live QA and video viewing updates ([2bd8b83](https://github.com/maiprop/maiprop-listing-site/commit/2bd8b83edeb9c0bd3c7417a99ce88120979f762f))


### Bug Fixes

* clear deepsource deploy smoke findings ([6f33f08](https://github.com/maiprop/maiprop-listing-site/commit/6f33f080ae0a142b1923b39cdd65aeff7f655231))
* clear deploy smoke DeepSource findings ([#175](https://github.com/maiprop/maiprop-listing-site/issues/175)) ([667d6cb](https://github.com/maiprop/maiprop-listing-site/commit/667d6cbd10f847a81aacc827114d25164889be9c))
* clear final release gates ([7a8cc03](https://github.com/maiprop/maiprop-listing-site/commit/7a8cc034ef97f69e134b9f78665d991beddde25f))
* finalize remediation gate followups ([#172](https://github.com/maiprop/maiprop-listing-site/issues/172)) ([e09bdb1](https://github.com/maiprop/maiprop-listing-site/commit/e09bdb1b96265e852063827391bdbe9f76b35ea8))
* protect platform admin report access ([741b4cc](https://github.com/maiprop/maiprop-listing-site/commit/741b4cc158731af4007b18b5805035dcf7036229))


### Performance Improvements

* harden public traffic and perf gates ([8e6c796](https://github.com/maiprop/maiprop-listing-site/commit/8e6c7969c97051defef54bab4422f249a3a94f18))

## [1.8.1](https://github.com/maiprop/maiprop-listing-site/compare/v1.8.0...v1.8.1) (2026-05-17)


### Bug Fixes

* align SEO listings filters with route intent ([c79f72c](https://github.com/maiprop/maiprop-listing-site/commit/c79f72c894cf7bc52d552dde27189c237a917e0d))
* allow staging edge deploy without db url ([7630929](https://github.com/maiprop/maiprop-listing-site/commit/76309298e66670ea2993b6db94da8d77c0a5471a))
* harden release SEO and staging gates ([5b396fc](https://github.com/maiprop/maiprop-listing-site/commit/5b396fcab5d9d3ad9e2e14d862ca86f6ecabeb70))
* recover AI modules from provider and chunk failures ([aa716d3](https://github.com/maiprop/maiprop-listing-site/commit/aa716d3a8fca1742d270dd80205b69f14e49a55a))
* recover from stale chunk loads ([928102b](https://github.com/maiprop/maiprop-listing-site/commit/928102b164dc2a96204ada52ae8933a0da859c1c))

## [1.8.0](https://github.com/maiprop/maiprop-listing-site/compare/v1.7.0...v1.8.0) (2026-05-17)


### Features

* add safe Stripe mock billing mode ([8858157](https://github.com/maiprop/maiprop-listing-site/commit/885815732e17e219a57ca08b2f89cf0f11f717c8))


### Bug Fixes

* add open house valuation report tools ([b445e54](https://github.com/maiprop/maiprop-listing-site/commit/b445e5458f9f41601d7dfaec5f06a1bbbb679c0b))
* address deployment review findings ([08ee348](https://github.com/maiprop/maiprop-listing-site/commit/08ee3487fc84fb2c64c1745cc8614017cade0ac4))
* address onboarding review and staging e2e ([5924fb2](https://github.com/maiprop/maiprop-listing-site/commit/5924fb225b9e0ca4c1ba7de748d966d0c880447f))
* address pr 154 review blockers ([eebf403](https://github.com/maiprop/maiprop-listing-site/commit/eebf4037b61975b34bbf8ff1e9a5fd98470ea362))
* address pr 154 scanner findings ([f5bc43f](https://github.com/maiprop/maiprop-listing-site/commit/f5bc43f53c8b26a3402a3e2ca5f90172abf52a47))
* address pr 155 entitlement review ([6dbac13](https://github.com/maiprop/maiprop-listing-site/commit/6dbac1375c433c9023517a7d86edd101c4ec24cc))
* address pr 155 review issues ([b7588f9](https://github.com/maiprop/maiprop-listing-site/commit/b7588f970a8550f815fe70ca9331e01127cedbba))
* address pr 155 scanner findings ([fefbb3c](https://github.com/maiprop/maiprop-listing-site/commit/fefbb3c009c56dfe518f51cbda1442ebb59a31da))
* address pr review blockers ([fdf0079](https://github.com/maiprop/maiprop-listing-site/commit/fdf00796f67b3e0d71365955bf33facfacb99ff6))
* allow account settings during onboarding ([7202e42](https://github.com/maiprop/maiprop-listing-site/commit/7202e42a58b6bbfc370e328e9babaa1e8aa2a862))
* allow account settings during onboarding ([4f010f7](https://github.com/maiprop/maiprop-listing-site/commit/4f010f7906bd3732bae538c7110b83e5563a45aa))
* always render account settings route ([55c450b](https://github.com/maiprop/maiprop-listing-site/commit/55c450b6135df2f1f97b2018132e9f185cc501e0))
* always render account settings route ([cca37bd](https://github.com/maiprop/maiprop-listing-site/commit/cca37bd3ad36cdb120c08f1af4b6fda6039452d5))
* avoid global function declarations in reviewed components ([6f3ee01](https://github.com/maiprop/maiprop-listing-site/commit/6f3ee01df03195ba2e86112700440e867016c0ad))
* avoid global function declarations in reviewed components ([aaf13ee](https://github.com/maiprop/maiprop-listing-site/commit/aaf13ee935fa3f5db823ab358aa1d50ffb5adbf2))
* clarify quick sale validation ([d03c3aa](https://github.com/maiprop/maiprop-listing-site/commit/d03c3aa4adbd380d44537b71e55abf9baf535c41))
* clean listing ad UX and messaging ([fbebd0e](https://github.com/maiprop/maiprop-listing-site/commit/fbebd0e0ea816c4d3ee7ce0dc6d45aa4462381ce))
* clear ci and deepsource gates ([bbd5e1c](https://github.com/maiprop/maiprop-listing-site/commit/bbd5e1c60cabe0736d47b1ac1dcc79df8733f72f))
* clear deepsource javascript blockers ([f2b0776](https://github.com/maiprop/maiprop-listing-site/commit/f2b0776b23a319d4022ab6202cc11435d2fda4c8))
* clear deepsource javascript findings ([a1ffbf1](https://github.com/maiprop/maiprop-listing-site/commit/a1ffbf161389412b7f881cf88f4d30f94491cf00))
* clear deepsource javascript findings ([7a7d673](https://github.com/maiprop/maiprop-listing-site/commit/7a7d6731e4c1f81ab0002b125f8412fb9c102061))
* clear pr 154 deepsource handler warnings ([8925edb](https://github.com/maiprop/maiprop-listing-site/commit/8925edbca88bed9a91a38a94db3c6a28b9c18e3c))
* clear pr 154 review warnings ([db2fd1c](https://github.com/maiprop/maiprop-listing-site/commit/db2fd1c19212c3f1aca93753de4912d0da233b85))
* clear pr 154 review warnings ([5e2645e](https://github.com/maiprop/maiprop-listing-site/commit/5e2645ea80b9caf058d6e61a6b47ed34dc6a5c0d))
* clear pr 154 scanner blockers ([1c7f6e8](https://github.com/maiprop/maiprop-listing-site/commit/1c7f6e819d5d8ba5dd3d5270736c8bd59c4100aa))
* clear pr 155 deepsource warnings ([f56680b](https://github.com/maiprop/maiprop-listing-site/commit/f56680ba5b5656309dc42f38bc3a70eb37a46bea))
* clear redirect complexity warning ([2dcf9f7](https://github.com/maiprop/maiprop-listing-site/commit/2dcf9f7cfa2398435b092584a679193d90029438))
* clear remaining ci blockers ([295ba31](https://github.com/maiprop/maiprop-listing-site/commit/295ba31c0023d34a7731090ee62eb30386da6034))
* clear remaining pr scanner findings ([b8e41e1](https://github.com/maiprop/maiprop-listing-site/commit/b8e41e1cdf915dff9ac5524fe743f09ff50706c1))
* clear remaining pr scanner findings ([1cafe4b](https://github.com/maiprop/maiprop-listing-site/commit/1cafe4b8f54eba651c69e9b26856de9a3167dd59))
* close audit gate gaps ([d93e65f](https://github.com/maiprop/maiprop-listing-site/commit/d93e65f4eca261b3b302ca0a537e99c6da835afd))
* document intentional modal complexity ([8d4219a](https://github.com/maiprop/maiprop-listing-site/commit/8d4219ae74d65b13fad05669922128c5ea1a1f2f))
* document intentional modal complexity ([ec1900c](https://github.com/maiprop/maiprop-listing-site/commit/ec1900c10c90a2ad6ca08c061cdc2369fd4a96f3))
* export drawn signatures asynchronously ([e21e81e](https://github.com/maiprop/maiprop-listing-site/commit/e21e81e751978b590170df87d912426924c4378f))
* export drawn signatures asynchronously ([5148520](https://github.com/maiprop/maiprop-listing-site/commit/51485202f9e614e01daf1ce93df02523195df25d))
* gate professional client workflows ([b51feae](https://github.com/maiprop/maiprop-listing-site/commit/b51feae1c81991849c82f932a11804650a8c0e68))
* harden agent data input quota migrations ([a649543](https://github.com/maiprop/maiprop-listing-site/commit/a649543f8de9451cc361d93f1a9a7bffa8e8835f))
* harden deployment readiness issues ([dd406f0](https://github.com/maiprop/maiprop-listing-site/commit/dd406f09d3db3ab458ffbcf970a1345ca4cc9832))
* harden entitlements and live release gates ([08e9990](https://github.com/maiprop/maiprop-listing-site/commit/08e9990fdb67e52a25af2682da809b10dfc7aef6))
* harden onboarding and module access ([14eb95a](https://github.com/maiprop/maiprop-listing-site/commit/14eb95a7dde3243f87c315c490aaee9c1d15434e))
* harden onboarding module flow ([6e4a632](https://github.com/maiprop/maiprop-listing-site/commit/6e4a6329d5dc0814d12f7fc817ed783082a15d89))
* harden release ai and portal flows ([fd493da](https://github.com/maiprop/maiprop-listing-site/commit/fd493da74b8ee64df7fd0f8ba43fbccb93ea334f))
* harden release gates and billing add-ons ([51f0dd0](https://github.com/maiprop/maiprop-listing-site/commit/51f0dd0f2525c2f138c35502443b9b39984a3454))
* improve auction rotation and detail metadata ([0d32005](https://github.com/maiprop/maiprop-listing-site/commit/0d320059b12da0ae73ef9f28b6d816529177d84f))
* move firesale admin workflows into rpcs ([af7bfdd](https://github.com/maiprop/maiprop-listing-site/commit/af7bfdda8049d957c8860fa79c564201da2d413f))
* move invitation review invariants server-side ([57b8c41](https://github.com/maiprop/maiprop-listing-site/commit/57b8c4164c302a5ec5f88d96100f390fa68cafb9))
* name checkout edge handler ([b9b2c9c](https://github.com/maiprop/maiprop-listing-site/commit/b9b2c9c3f949dd109ed7a32d8c0df53a2fc81e01))
* pin visualizer for node 20 ci ([0cc1c70](https://github.com/maiprop/maiprop-listing-site/commit/0cc1c7091952a7e05474436edf13c3b54afc1fcd))
* prevent seller switch listing dead end ([e45a45b](https://github.com/maiprop/maiprop-listing-site/commit/e45a45bed1bfe83abb2ac380cb09a994d5bbd6c5))
* reduce checkout helper complexity ([f440b4c](https://github.com/maiprop/maiprop-listing-site/commit/f440b4c3ced1d85638b92b7e336d029f4d260341))
* reduce deepsource javascript findings ([d2c458c](https://github.com/maiprop/maiprop-listing-site/commit/d2c458cbc044d376e7882b599d63f119edf4e4ce))
* reduce pr 154 scanner complexity ([df3b929](https://github.com/maiprop/maiprop-listing-site/commit/df3b92984ff430412d98def703a63d9b2ca56f69))
* remove complex consultation slot helper ([9736200](https://github.com/maiprop/maiprop-listing-site/commit/9736200cc3528ce3737a2c2beb4efbaa27e494b4))
* remove global billing helper declarations ([f1bfb1d](https://github.com/maiprop/maiprop-listing-site/commit/f1bfb1d5d8ab744febe15911150ac001df098bf3))
* resolve auctions lighthouse accessibility ([589b4e2](https://github.com/maiprop/maiprop-listing-site/commit/589b4e292ce9c3fcf2b382319899cfa390633741))
* resolve pr 155 scanner blockers ([d870b0b](https://github.com/maiprop/maiprop-listing-site/commit/d870b0bbd1d992ab88d4a6333a7606699110cfb8))
* satisfy checkout static analysis ([5259c12](https://github.com/maiprop/maiprop-listing-site/commit/5259c12c2c8c3bb914910bf099632f9a82bfb968))
* satisfy deepsource edge helpers ([cd295c8](https://github.com/maiprop/maiprop-listing-site/commit/cd295c865656bffe8a3e4ef0d64fc8e9518236c0))
* satisfy javascript quality gate ([df92c93](https://github.com/maiprop/maiprop-listing-site/commit/df92c93fe67500456a73414c09b4edf4ec2840dc))
* serialize open house registrations ([54d129e](https://github.com/maiprop/maiprop-listing-site/commit/54d129e84585351a9606daf42bfea18e3ca8ccdb))
* simplify consultation slot generation ([820a4e4](https://github.com/maiprop/maiprop-listing-site/commit/820a4e45640eb807ed644762a2db568fa87cfe97))
* simplify onboarding video save handler ([f7b1347](https://github.com/maiprop/maiprop-listing-site/commit/f7b1347186f3449314808bffbc48f90b04bd1b12))
* simplify onboarding video save handler ([421ec06](https://github.com/maiprop/maiprop-listing-site/commit/421ec069cfd45caf930dc6c28def36fad2973d52))
* stabilize stripe edge function imports ([82e3002](https://github.com/maiprop/maiprop-listing-site/commit/82e3002891195ef195f1ab085b581607d19c5be1))
* **supabase:** add explicit data api grants ([37228c3](https://github.com/maiprop/maiprop-listing-site/commit/37228c33b09e0a2dad666a5a2a98a9f5833e871c))
* sync dashboard section with route ([9591eaf](https://github.com/maiprop/maiprop-listing-site/commit/9591eaf80c3e1091fafe82a2b7f2edac16747745))
* sync dashboard section with route ([f3f78fb](https://github.com/maiprop/maiprop-listing-site/commit/f3f78fb2b2e40ff10163656dc49043d2b45c64fb))
* tighten developer entitlement checks ([71ce88b](https://github.com/maiprop/maiprop-listing-site/commit/71ce88bc27adb00e38c80b16c06dfa9ade69cb97))
* unblock ci quality gates ([de69b79](https://github.com/maiprop/maiprop-listing-site/commit/de69b79e7a35254b4434e532e49397fdab53b505))
* validate pro entitlements from server table ([6744aa8](https://github.com/maiprop/maiprop-listing-site/commit/6744aa8d6d593abd2d655f2b2fa268f305787cde))
* validate pro entitlements from server table ([91a7a0f](https://github.com/maiprop/maiprop-listing-site/commit/91a7a0f1f8dff9542a46177597929a1c23f81cfd))


### Performance Improvements

* keep auctions lcp static ([d82d65c](https://github.com/maiprop/maiprop-listing-site/commit/d82d65cfae78b7e57853fac3f720ceb7bc04e4ce))
* prioritize static auctions heading for lcp ([c45175b](https://github.com/maiprop/maiprop-listing-site/commit/c45175be67a0e992733be386a03da73754ecbf92))
* stabilize auction and admin lighthouse layouts ([a98b5fc](https://github.com/maiprop/maiprop-listing-site/commit/a98b5fc9a45649363d987efef91c8812212abb5a))

## [1.7.0](https://github.com/maiprop/maiprop-listing-site/compare/v1.6.2...v1.7.0) (2026-05-12)


### Features

* unify auction routes — all auctions under /auction/:id ([#153](https://github.com/maiprop/maiprop-listing-site/issues/153)) ([1edd1e9](https://github.com/maiprop/maiprop-listing-site/commit/1edd1e9a927c0fce461cbf3dda36574d2cb7e006))


### Bug Fixes

* add handle_new_user trigger + backfill 14 missing profile rows ([b86ac6b](https://github.com/maiprop/maiprop-listing-site/commit/b86ac6bb08864a582e7b5cb63dc181ed34274afc))
* **ci:** rename future-dated migration 20260707 → 20260511183000 ([66773a2](https://github.com/maiprop/maiprop-listing-site/commit/66773a2d5490dae29e8b5637bbafe91ca5b88d90))
* extract real error message from FunctionsHttpError in PropertyMiniMap ([#152](https://github.com/maiprop/maiprop-listing-site/issues/152)) ([9fc759b](https://github.com/maiprop/maiprop-listing-site/commit/9fc759be50e9c0b65055ece0422efa22531d9ae6))
* gate AI market insights + neighbourhood reports behind Pro subscription ([#141](https://github.com/maiprop/maiprop-listing-site/issues/141)) ([8166c01](https://github.com/maiprop/maiprop-listing-site/commit/8166c0154e6404e7718a65ecb88dd797486316fa))
* **migration:** use column default for role in handle_new_user trigger ([2df3213](https://github.com/maiprop/maiprop-listing-site/commit/2df32139d1fe39629b3674ccb7850214ddf5a331))


### Performance Improvements

* remove recharts from initial bundle, lazy AIAssistantWidget, isolate vendor chunks ([d2d767c](https://github.com/maiprop/maiprop-listing-site/commit/d2d767c9547669a5f76229d8efe26de645afa1e6))

## [1.6.2](https://github.com/maiprop/maiprop-listing-site/compare/v1.6.1...v1.6.2) (2026-05-11)


### Bug Fixes

* **codacy/deepsource:** resolve Codacy false positives and DeepSource issues ([74ec7b7](https://github.com/maiprop/maiprop-listing-site/commit/74ec7b7aacbdd30a7bfb870a82974cd26874242b))
* **pr135:** resolve 4 critical bugs — role switch, open house, auction pages, AI tools ([b9d0ec1](https://github.com/maiprop/maiprop-listing-site/commit/b9d0ec10c1fdb8975ba07e3b5c2c654eac696832))
* **test:** restore double-cast in buildAuctionFilter stub (TS2352 regression) ([64ddb1d](https://github.com/maiprop/maiprop-listing-site/commit/64ddb1d1cae18b09bb667eaf43f29936979ef7aa))
* typology system — permissions, routing, errors ([#138](https://github.com/maiprop/maiprop-listing-site/issues/138)) ([902ff5c](https://github.com/maiprop/maiprop-listing-site/commit/902ff5c789d740178268677fd7132aa05bbb418f))

## [1.6.1](https://github.com/maiprop/maiprop-listing-site/compare/v1.6.0...v1.6.1) (2026-05-10)


### Bug Fixes

* **codacy:** reduce cyclomatic complexity + remove dead code ([#130](https://github.com/maiprop/maiprop-listing-site/issues/130)) ([e3b9b02](https://github.com/maiprop/maiprop-listing-site/commit/e3b9b021d8ae689db05ad9b86afff5acee499932))
* **migrations:** resolve duplicate timestamp 20260706000000 ([#131](https://github.com/maiprop/maiprop-listing-site/issues/131)) ([a0686a1](https://github.com/maiprop/maiprop-listing-site/commit/a0686a1a9c41213c73a297a635ec88986f16bab6))

## [1.6.0](https://github.com/maiprop/maiprop-listing-site/compare/v1.5.0...v1.6.0) (2026-05-10)


### Features

* **typology:** atomic role-switch with archive of role-specific data (Slice 1) ([#121](https://github.com/maiprop/maiprop-listing-site/issues/121)) ([9ea74e8](https://github.com/maiprop/maiprop-listing-site/commit/9ea74e89c5eea45ad40415997821e05955ccfdf5))


### Bug Fixes

* address PR review findings — migration hashes, stripe-webhook safety, closing_date CHECK ([#117](https://github.com/maiprop/maiprop-listing-site/issues/117)) ([716a8e2](https://github.com/maiprop/maiprop-listing-site/commit/716a8e2c104f150a31401db4701687c1155f99a7))
* **ci:** accept 401 or 503 in data-input-credit Deno test ([#113](https://github.com/maiprop/maiprop-listing-site/issues/113)) ([59ae522](https://github.com/maiprop/maiprop-listing-site/commit/59ae5220c343de00127bfde4f7b09652697302b5))
* **security:** harden os-sales-coordinates and os-diagnose edge functions ([#111](https://github.com/maiprop/maiprop-listing-site/issues/111)) ([f7e9ef0](https://github.com/maiprop/maiprop-listing-site/commit/f7e9ef08b83a3def2ef08aab82d093a110990864))
* strict release security hardening ([db9deba](https://github.com/maiprop/maiprop-listing-site/commit/db9deba6f079500ccd6cbc6bc8731b1833935e16))


### Performance Improvements

* **db:** drop strictly-redundant unused indexes + triage doc ([#120](https://github.com/maiprop/maiprop-listing-site/issues/120)) ([0eac3de](https://github.com/maiprop/maiprop-listing-site/commit/0eac3ded21888282f5792c2e8823a2e1e58212e7))

## [1.5.0](https://github.com/maiprop/maiprop-listing-site/compare/v1.4.0...v1.5.0) (2026-05-05)


### Features

* **data:** extend property types + production data re-seed ([e562a0d](https://github.com/maiprop/maiprop-listing-site/commit/e562a0d4c10cc0d1ab91230e5fe7e4b4f29f2046))


### Bug Fixes

* **types:** extend Property.type to include all new property_type enum values ([6a85519](https://github.com/maiprop/maiprop-listing-site/commit/6a85519a8fa323242491722ed59e3c01ee7d6285))

## [1.4.0](https://github.com/maiprop/maiprop-listing-site/compare/v1.3.1...v1.4.0) (2026-05-05)


### Features

* **auctions:** 200/day rotating poll cap, flag + enrichment edge functions ([8aef14e](https://github.com/maiprop/maiprop-listing-site/commit/8aef14e51639d9baeb0b3ba5c826f85934a32842))

## [1.3.1](https://github.com/maiprop/maiprop-listing-site/compare/v1.3.0...v1.3.1) (2026-05-05)


### Bug Fixes

* **ci:** skip Cloudflare preview deploy for Dependabot PRs ([2a98d99](https://github.com/maiprop/maiprop-listing-site/commit/2a98d9979e646f5df61f903ddacce139925b2786))
* **coverage:** correct thresholds to reflect actual measured coverage ([38836c1](https://github.com/maiprop/maiprop-listing-site/commit/38836c1b95e3edebc777af33b17e0b6e01dd8243))
* **e2e:** update /firesale tests to reflect public route change ([0d0bbb2](https://github.com/maiprop/maiprop-listing-site/commit/0d0bbb252041a7ffa5bd90f2e318f6605440cf0b))
* **hooks:** guard SyntaxError correctly in useSubmitDataInput error handler ([521c6c4](https://github.com/maiprop/maiprop-listing-site/commit/521c6c4557223ad4fdf3f281d50d8e743d5408ac))
* **lint:** move stale eslint-disable-next-line to inline form in agent-data-input ([768d562](https://github.com/maiprop/maiprop-listing-site/commit/768d56243c1684a45784dba9d590dfd841ca3ea4))
* **lint:** remove stale eslint-disable comments in agent-data-input ([022de4f](https://github.com/maiprop/maiprop-listing-site/commit/022de4f78e42e6afbd2941301315c033932243eb))
* **types:** resolve 22 TypeScript errors exposed by any-suppression removal ([463a4c8](https://github.com/maiprop/maiprop-listing-site/commit/463a4c866adf2049e753d4cc7a66234fd6b24ebb))

## [1.3.0](https://github.com/maiprop/maiprop-listing-site/compare/v1.2.0...v1.3.0) (2026-05-04)


### Features

* **dashboard:** Agent Data Input — closings to next-invoice discount with lifetime submission ban ([#86](https://github.com/maiprop/maiprop-listing-site/issues/86)) ([e8ef2f0](https://github.com/maiprop/maiprop-listing-site/commit/e8ef2f0727a44d27eb04095ebaf38d2b6f35bef8))


### Bug Fixes

* **admin:** rejection with empty notes no longer falls into pending bucket ([#84](https://github.com/maiprop/maiprop-listing-site/issues/84)) ([a0f4f42](https://github.com/maiprop/maiprop-listing-site/commit/a0f4f426fdc464fe7f6c53ee9a41dcab86d86af5))
* **audit:** re-do deep-read findings — E2E + edge-fn type safety ([#83](https://github.com/maiprop/maiprop-listing-site/issues/83)) ([b298c1e](https://github.com/maiprop/maiprop-listing-site/commit/b298c1ee86e26430e3ceed8d75d6f380fa9136e9))
* remove non-existent email column from registrations profiles embed ([#85](https://github.com/maiprop/maiprop-listing-site/issues/85)) ([e157b1b](https://github.com/maiprop/maiprop-listing-site/commit/e157b1be4608000b41cab93f449856a8913effd8))

## [1.2.0](https://github.com/maiprop/maiprop-listing-site/compare/v1.1.2...v1.2.0) (2026-05-04)


### Features

* **agent:** Data Input loyalty programme — DB, backend, Stripe, UI ([#87](https://github.com/maiprop/maiprop-listing-site/issues/87)) ([c00c6c9](https://github.com/maiprop/maiprop-listing-site/commit/c00c6c96fc9e670b545452f04e6df98acd0514ee))
* **pricing:** invitation-only Investor & Institutional; Agent/Professional Pro-only with add-ons ([#79](https://github.com/maiprop/maiprop-listing-site/issues/79)) ([5672b33](https://github.com/maiprop/maiprop-listing-site/commit/5672b33208f8ec574c1e2d713f52d3ef37353bf1))


### Bug Fixes

* **a11y:** add brand-cyan-deep token for white text on cyan (WCAG AA) ([#76](https://github.com/maiprop/maiprop-listing-site/issues/76)) ([0aeaec2](https://github.com/maiprop/maiprop-listing-site/commit/0aeaec28247db6db0f9c00e52530daea3f9ef25a))
* **audit:** batch P2/P3 audit cleanup (defence-in-depth, code quality) ([#66](https://github.com/maiprop/maiprop-listing-site/issues/66)) ([a188e35](https://github.com/maiprop/maiprop-listing-site/commit/a188e35ffca1a5bb296cb78f6af718dbc5fc7dfe))
* **ci:** drop unmeasurable Lighthouse assertions for LH12/stub build ([9b334de](https://github.com/maiprop/maiprop-listing-site/commit/9b334de19ac16622b02ee277e8c9040b25bb6fec))
* **e2e:** close deferred finding [#6](https://github.com/maiprop/maiprop-listing-site/issues/6) — replace networkidle with React-mount waits on Mapbox routes ([#78](https://github.com/maiprop/maiprop-listing-site/issues/78)) ([baf743b](https://github.com/maiprop/maiprop-listing-site/commit/baf743b17db7f24ace19542c749d0ef68285891a))
* **lint:** remove stale eslint-disable-next-line in auth-email-hook ([c99c7ef](https://github.com/maiprop/maiprop-listing-site/commit/c99c7ef6d3772bdf231cf3212efd1254fb0db164))
* **listings:** align server priority bucket with client to stop mid-scroll reorder ([#88](https://github.com/maiprop/maiprop-listing-site/issues/88)) ([3ac2b26](https://github.com/maiprop/maiprop-listing-site/commit/3ac2b2666222ca3145395d838c42ca73dc36e24b))
* **listings:** make server ORDER BY match the client promoted-first sort ([#80](https://github.com/maiprop/maiprop-listing-site/issues/80)) ([10f32fe](https://github.com/maiprop/maiprop-listing-site/commit/10f32febf8902375eae41bdd64d66ddba12df093))
* Medium audit findings — CORS, RLS, route gating, a11y, Deno tests ([#73](https://github.com/maiprop/maiprop-listing-site/issues/73)) ([dccb7c6](https://github.com/maiprop/maiprop-listing-site/commit/dccb7c6b4cdace03ac2e845dfe8100f4bcd208eb))

## [1.1.2](https://github.com/maiprop/maiprop-listing-site/compare/v1.1.1...v1.1.2) (2026-05-03)


### Bug Fixes

* **listings:** paginate grid view to remove silent 200-row cap ([#72](https://github.com/maiprop/maiprop-listing-site/issues/72)) ([11f70de](https://github.com/maiprop/maiprop-listing-site/commit/11f70de4301fdd4fa81dd362245074fee7afd9e5))
* **security,quality:** address 5 deep-read findings (rate limiter, CORS, any types, BASE_URL, ProfileEditor) ([#62](https://github.com/maiprop/maiprop-listing-site/issues/62)) ([48a83ee](https://github.com/maiprop/maiprop-listing-site/commit/48a83ee0f21fd8358dff46b61a0ecc4e18c98078))
* **upload:** centralised MIME allowlist + reject unsupported uploads ([#70](https://github.com/maiprop/maiprop-listing-site/issues/70)) ([dd9d69f](https://github.com/maiprop/maiprop-listing-site/commit/dd9d69f1557775fc7943484c3665fc2409010a15))

## [1.1.1](https://github.com/maiprop/maiprop-listing-site/compare/v1.1.0...v1.1.1) (2026-05-03)


### Bug Fixes

* CRITICAL — close paywall bypass, ownership check, Pro gate, mass-assignment ([#64](https://github.com/maiprop/maiprop-listing-site/issues/64)) ([656791d](https://github.com/maiprop/maiprop-listing-site/commit/656791d57661754dbe44dc3c09a90ebaa81f323e))
* **security:** close 2 P1 audit findings ([#65](https://github.com/maiprop/maiprop-listing-site/issues/65)) ([f861ca3](https://github.com/maiprop/maiprop-listing-site/commit/f861ca38057129cc723275a508e353417af32ee5))

## [1.1.0](https://github.com/maiprop/maiprop-listing-site/compare/v1.0.0...v1.1.0) (2026-05-03)


### Features

* testing & docs batch — 27 new hook tests, accessibility audit, B5/F7 docs ([#61](https://github.com/maiprop/maiprop-listing-site/issues/61)) ([11645af](https://github.com/maiprop/maiprop-listing-site/commit/11645afe268d60f7487043d479d97c231fbccc15))

## 1.0.0 (2026-05-03)


### Features

* add new-build for-rent listings to seed script (6 managed rentals) ([abde18a](https://github.com/maiprop/maiprop-listing-site/commit/abde18a7db8a10bf9c09054d678c3225ed34f2f7))
* add seed-mock-open-houses script (12 listings with full settings) ([d92adb6](https://github.com/maiprop/maiprop-listing-site/commit/d92adb655818e4e98d995d03614e498fdd0ca23c))
* **ai-usage:** monthly quota enforcement across AI edge functions ([f99a996](https://github.com/maiprop/maiprop-listing-site/commit/f99a9961c624e9deea76fe70a155923f1d3582b3))
* CI/CD batch — edge function deploy, release-please, docs, Dockerfile, i18n cache ([#58](https://github.com/maiprop/maiprop-listing-site/issues/58)) ([155e1d0](https://github.com/maiprop/maiprop-listing-site/commit/155e1d00ea7869f3d5a6e106e8c8622261692462))
* code quality batch — SRI, ARIA, dashboard tests, observability & image docs ([#59](https://github.com/maiprop/maiprop-listing-site/issues/59)) ([e71accb](https://github.com/maiprop/maiprop-listing-site/commit/e71accb1213efdfce7facfb52b1a18ff155006ee))
* comprehensive code quality improvements ([84c6c4a](https://github.com/maiprop/maiprop-listing-site/commit/84c6c4a43fd2e0b10bb5b5367919b0f92dfe9bf2))
* CORS env-gating, CSP reporting, retry utility, rate-limit alerting, index docs ([#39](https://github.com/maiprop/maiprop-listing-site/issues/39)) ([cf90ca3](https://github.com/maiprop/maiprop-listing-site/commit/cf90ca31847e063a36fe89c3ecfd89a02607d449))
* **deploy:** migrate from Netlify to Cloudflare Pages ([4431cec](https://github.com/maiprop/maiprop-listing-site/commit/4431cecad10c7bfb47fbebe7b9c9e84bd2b22a19))
* **deploy:** rebuild with real Vite secrets in the Cloudflare production deploy ([f53e14c](https://github.com/maiprop/maiprop-listing-site/commit/f53e14cb5655e898afde07ac9df5d7a17e7b186e))
* **edge:** add site-lock + canonical-host 301 redirect ([cd5917f](https://github.com/maiprop/maiprop-listing-site/commit/cd5917fe419fa5ade39987ab2a7e94c133b98c2c))
* i18n, performance optimisations, new pages, Netlify deploy config ([9b47596](https://github.com/maiprop/maiprop-listing-site/commit/9b47596a38f83360e4f323eef5e66367916079a0))
* **logger:** add structured JSON logger for edge functions; migrate top 5 fns ([5acde61](https://github.com/maiprop/maiprop-listing-site/commit/5acde61f59de725751a894fbe111407d6e066d25))
* **logger:** migrate remaining 24 edge functions to structured logger (0 console.* left) ([ae99647](https://github.com/maiprop/maiprop-listing-site/commit/ae99647ebe583ef0af572438b8270b1977669b80))
* notifications dropdown, new build interest form, featured ads expiry ([7db58b9](https://github.com/maiprop/maiprop-listing-site/commit/7db58b97aaa10f356c9b37466ff6011dd77f4279))
* **observability:** forward edge function errors to Sentry via SENTRY_DSN ([2bfff42](https://github.com/maiprop/maiprop-listing-site/commit/2bfff42553e35082248ea233c8e2d6fa40023da6))
* overhaul onboarding role selection flow and security checks ([6368178](https://github.com/maiprop/maiprop-listing-site/commit/636817830908819af59f3b2fd736cea874c4ff1c))
* overhaul onboarding role selection flow and security checks ([435ec26](https://github.com/maiprop/maiprop-listing-site/commit/435ec26273d153ddb81d9becc3da5d7f1f217dc5))
* Phase 2e-3 — password policy, select(*) fix, circuit breaker, healthz, commitlint ([#37](https://github.com/maiprop/maiprop-listing-site/issues/37)) ([07e9f2d](https://github.com/maiprop/maiprop-listing-site/commit/07e9f2d8c78500bd976fabfff737f383ab7940aa))
* phase 4 batch 2 — seed hardening, docs cleanup, DR runbook, tests ([#40](https://github.com/maiprop/maiprop-listing-site/issues/40)) ([7691d27](https://github.com/maiprop/maiprop-listing-site/commit/7691d2738cbfd2590ffa64c9c852d56de46073ca))
* Phase 5 Batch 1 — docs, CI hardening, error toast specificity ([#55](https://github.com/maiprop/maiprop-listing-site/issues/55)) ([887a6f3](https://github.com/maiprop/maiprop-listing-site/commit/887a6f34bda248299110447bbbdbe1b360a6be9c))
* plan limits, usage-based add-ons, free/pro dashboard and profile tiers ([6467718](https://github.com/maiprop/maiprop-listing-site/commit/6467718a02f08bd126a188835480c42793cec1b0))
* **pro-gate:** consolidate paywall at the dashboard section level ([0b90eba](https://github.com/maiprop/maiprop-listing-site/commit/0b90eba721ba39de766dc01b896ecac50741ab89))
* RLS NULL guards on all admin policies + rate limit & timeout all edge functions ([#33](https://github.com/maiprop/maiprop-listing-site/issues/33)) ([bf3f569](https://github.com/maiprop/maiprop-listing-site/commit/bf3f56995bdb356d067d67b840341a296079d373))
* **scripts:** migration idempotency lint with vitest tests and CI step ([1782c07](https://github.com/maiprop/maiprop-listing-site/commit/1782c07ae96098be8f9e664700d66c83302b3a5f))
* security batch — Sentry, CSP, UptimeRobot, auth audit, on-call docs ([#57](https://github.com/maiprop/maiprop-listing-site/issues/57)) ([f754edf](https://github.com/maiprop/maiprop-listing-site/commit/f754edf76a59ae48f07f0713e598e5a4273c13fa))
* **security:** server-side rate limiting + authoritative role + plan-limit hardening ([e95ece4](https://github.com/maiprop/maiprop-listing-site/commit/e95ece430f8280a13a36e1ffa14453918717083b))


### Bug Fixes

* 25 issues across forms, auth, admin, pricing, and UX flows ([4bd780d](https://github.com/maiprop/maiprop-listing-site/commit/4bd780d9c5a508cabac487922fd9860328c0b718))
* **a11y+e2e:** final axe fixes and nav locator ordering ([d14d512](https://github.com/maiprop/maiprop-listing-site/commit/d14d5126282debbcbfe545d0df6a95e4fb01e325))
* **a11y+e2e:** render Navbar during PropertyDetail loading, add h1 on Listings, fix form labels, darken Pricing accents, stabilize offline test ([6a2756a](https://github.com/maiprop/maiprop-listing-site/commit/6a2756a7567963276241d125428c4b24976dee1c))
* **a11y:** add aria-labels to OpenHouses view-mode, filters buttons and year select ([78c1f59](https://github.com/maiprop/maiprop-listing-site/commit/78c1f59620bad613a9f4c819cebb55c66882829a))
* add getPlanLimits to usePlanLimits vi.mock in both test files ([f377d7c](https://github.com/maiprop/maiprop-listing-site/commit/f377d7c137d9e184124c188b67f06e647390ec56))
* add missing Clock import in NeighbourhoodReport (crashed all property pages) ([ffc99d5](https://github.com/maiprop/maiprop-listing-site/commit/ffc99d563a893d789dad5ed49f3172c972739870))
* auction map — remove type tags, fix heatmap, fix draw area filter ([26e0f31](https://github.com/maiprop/maiprop-listing-site/commit/26e0f315e46f2b01b8d7f96d54f5b9858f5b0656))
* audit gap remediation - stripe admin auth, message attachments, OS sync, report card ([ea43c9e](https://github.com/maiprop/maiprop-listing-site/commit/ea43c9e0ecb46769698492d854b318a9be09a95c))
* **audit:** remediate 12 deep-audit findings ([63a35e4](https://github.com/maiprop/maiprop-listing-site/commit/63a35e42013f0a94e10a85357ccb88ee8fbc1b7d))
* brand name in auth emails, CI gate deploy, edge fn auth ([c76203a](https://github.com/maiprop/maiprop-listing-site/commit/c76203a6f145e32efc19d5105b5f2a28f27c3c93))
* **check-bundle-size:** support Vite 7 base64url chunk hashes + add regression tests ([5d2b1a1](https://github.com/maiprop/maiprop-listing-site/commit/5d2b1a18028e35731bff72fe07359d0af55e391a))
* **ci+a11y:** resolve final 2 migration failures and axe contrast ([6b526d4](https://github.com/maiprop/maiprop-listing-site/commit/6b526d4c0831670812e2301595d2359e701aa1a7))
* **ci:** unblock vitest run by stubbing Navigate + fixing smoke fixtures ([7187e83](https://github.com/maiprop/maiprop-listing-site/commit/7187e8349b3bae1f2522dba3d3e7a23795c018c4))
* **config:** flip canonical origin to portal.maiprop.co ([02a6a74](https://github.com/maiprop/maiprop-listing-site/commit/02a6a746e5e48c6d1f95a1af5511b39818f62f41))
* **cors:** add portal.maiprop.co to edge-function allowlists ([6c198d9](https://github.com/maiprop/maiprop-listing-site/commit/6c198d978ad04a8f0c99560ff289740d4dee7c4a))
* deno cache npm dep before test to ensure type resolution ([5a3d2e2](https://github.com/maiprop/maiprop-listing-site/commit/5a3d2e2d70d82ee343497756374f5db2f99c11cc))
* **deno-tests:** unblock the entire edge-function suite (171/171 green) ([5cc64aa](https://github.com/maiprop/maiprop-listing-site/commit/5cc64aaaaabbbbcb1641d918f2b192b63f0ab708))
* **e2e a11y:** pre-dismiss cookie banner before axe scans ([6c6eace](https://github.com/maiprop/maiprop-listing-site/commit/6c6eacebaba5b1b450b3cf3a814107810c49fa2b))
* handle header-normalised Bearer token in verifyBearerToken ([d98d3dc](https://github.com/maiprop/maiprop-listing-site/commit/d98d3dc0d0457d694b27be4ba27af79335113465))
* **lint:** remove unused createClient imports in ai-service-match and property-chat ([3f5941c](https://github.com/maiprop/maiprop-listing-site/commit/3f5941c321cad2afe0cf4c0ce15b997aa752cfdb))
* make all interaction E2E specs skip gracefully when creds are absent ([1b37c83](https://github.com/maiprop/maiprop-listing-site/commit/1b37c83f5805fce99eaeaf4187c883b71b093a83))
* **migrations:** add 'admin' enum value before referencing it in 20260318140000 ([6520b83](https://github.com/maiprop/maiprop-listing-site/commit/6520b835372538c42d3af9fe9ea1c747667a93cb))
* **migrations:** preserve auth.uid() default on has_platform_admin ([18f74fd](https://github.com/maiprop/maiprop-listing-site/commit/18f74fd5321989611ab50784300987968c1b7b7a))
* open house registration handles duplicate gracefully + better error messages ([#52](https://github.com/maiprop/maiprop-listing-site/issues/52)) ([d1dd759](https://github.com/maiprop/maiprop-listing-site/commit/d1dd759f1aeb343fef86b9b14356f705f415b353))
* **open-house:** comprehensive module audit fixes (12 bugs + 3 follow-ups) ([041b0c8](https://github.com/maiprop/maiprop-listing-site/commit/041b0c8adb7e12d07a73f6f6304f6d6378cd4c64))
* **pricing:** align Investor/Institutional pricing with database values and wire all features with limits ([572ad99](https://github.com/maiprop/maiprop-listing-site/commit/572ad99c5e398e9452c7fee7f51dd82bf9d84101))
* property pages, user type switching, quick sale loading, pricing tailoring ([eb6d41b](https://github.com/maiprop/maiprop-listing-site/commit/eb6d41bb59acf0b7654d95840e4dd4e0c77d4c97))
* remove admin/listing duplicates - delete useAuth, simplify AdminPricing, clarify nav labels ([401a3f5](https://github.com/maiprop/maiprop-listing-site/commit/401a3f5deb8e9cc8548584c517d1f06b49f9e414))
* remove npm:@supabase/supabase-js import from shared auth utilities ([794befa](https://github.com/maiprop/maiprop-listing-site/commit/794befa133abc5c31438b5f954b4c2cfc5076c4d))
* resolve 18 CI migration failures + a11y + pro-only types ([4eca0ea](https://github.com/maiprop/maiprop-listing-site/commit/4eca0eace07877f89eca9bd0d52b0aa888d4ca06))
* resolve 3 critical QA issues — UTF-8 mojibake, InvestorRoute blank page, force_pro_access override ([#38](https://github.com/maiprop/maiprop-listing-site/issues/38)) ([7fe7ae9](https://github.com/maiprop/maiprop-listing-site/commit/7fe7ae92f7235ee67debbf2f13dd1495c514bead))
* resolve all 19 reported issues ([e242795](https://github.com/maiprop/maiprop-listing-site/commit/e242795c93f69391ff4afa2acacad98fafa3f7d8))
* resolve all migration-validate CI failures ([0184a50](https://github.com/maiprop/maiprop-listing-site/commit/0184a5046dcfd19a48c09d68b707cfbbb6a2ac58))
* resolve all remaining audit issues from pre-launch review ([9842db6](https://github.com/maiprop/maiprop-listing-site/commit/9842db624c061e483b0126eaebb1bb5b6e4cc527))
* resolve all user typology flow issues across free and paid plans ([f691238](https://github.com/maiprop/maiprop-listing-site/commit/f691238cfa719334c993237ab57ed30b7b10ec61))
* resolve CI Deno type-resolution failure and harden deployment pipeline ([96c3ec8](https://github.com/maiprop/maiprop-listing-site/commit/96c3ec8cd5a4973ba091e4488619b898b3fc2678))
* resolve CI failures — migrations, axe violations, TS errors ([bcf9fc2](https://github.com/maiprop/maiprop-listing-site/commit/bcf9fc2ab7fab370eb3696d27c2e1521ad5d1b19))
* resolve CI failures from previous commit ([99b77e7](https://github.com/maiprop/maiprop-listing-site/commit/99b77e756c9ec56390263a1379dbee0db16a91cf))
* resolve lint errors in edge function test files ([f5343e1](https://github.com/maiprop/maiprop-listing-site/commit/f5343e1b513ced691fccd257d3b20f1ddd8425fc))
* resolve P0/P1 issues from pre-launch audit ([1d5be95](https://github.com/maiprop/maiprop-listing-site/commit/1d5be95a0857b626ac307967cc939831fb211854))
* resolve profiles RLS infinite recursion and add missing indexes ([#31](https://github.com/maiprop/maiprop-listing-site/issues/31)) ([89c399b](https://github.com/maiprop/maiprop-listing-site/commit/89c399b30d81ef6dd4500b056f6a7df9af604d29))
* resolve two E2E test failures ([bc7cc26](https://github.com/maiprop/maiprop-listing-site/commit/bc7cc26afae24cc1db092629599002ccda8db72d))
* run deno test from supabase/functions so deno.json is discovered ([f04330e](https://github.com/maiprop/maiprop-listing-site/commit/f04330e7d2155ef0310c16ab962c1c3ad7bbe970))
* sidebar button detects existing registration after page refresh ([#56](https://github.com/maiprop/maiprop-listing-site/issues/56)) ([2e11cdc](https://github.com/maiprop/maiprop-listing-site/commit/2e11cdca50d333a7d35f9495e077642878d0f636))
* **site-lock:** tolerate Sec-Fetch-Site / hostname variants in CSRF guard ([01b0421](https://github.com/maiprop/maiprop-listing-site/commit/01b04218c17d784235a7b484a93900f56a7bc390))
* sync package-lock.json after i18next-scanner was added ([31902ad](https://github.com/maiprop/maiprop-listing-site/commit/31902ad2c3bee5cde3295d3954819828e5193a6d))
* **test:** add afterEach(cleanup) to fix stale-DOM failures ([a5a28e5](https://github.com/maiprop/maiprop-listing-site/commit/a5a28e58604ae4d1230ab76126d13a2669fa7e3c))
* **test:** use string body+Content-Type in middleware tests for Node 20 undici ([8e5288f](https://github.com/maiprop/maiprop-listing-site/commit/8e5288fa3fae34daa916953d239ef3065b6c5668))
* **types:** gate CI build on tsc + fix 13 TS errors ([f12a218](https://github.com/maiprop/maiprop-listing-site/commit/f12a2181598e636d1dc67d5077f5c80fc7e5e8fc))
* UX crash audit — null coordinates, broken avatar img, valuation guard ([c9dd1b5](https://github.com/maiprop/maiprop-listing-site/commit/c9dd1b580e5e0d8c425ab6702f0811d3d5869d5e))


### Performance Improvements

* code splitting, WebP images, WebM hero video, pagination ([2d88a62](https://github.com/maiprop/maiprop-listing-site/commit/2d88a62a201c4ea2a7ebd93bd76bf20a13bb9fef))


### Reverts

* **edge:** disable portal\u2192maiprop.co 301 \u2014 DNS not aligned ([e9e19c6](https://github.com/maiprop/maiprop-listing-site/commit/e9e19c6789eccd808d1a325083594e7e2d33f644))
