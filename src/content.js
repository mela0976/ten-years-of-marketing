const content = {
  title: "決策智慧：十年",
  intro: "十年，十個一分鐘。",
  chapters: [
    {
      year: 2018, title: "不再是賭注", book: "2018 決策智慧",
      chat: { from: "老闆", text: "新的歸因工具上線了，以後每塊錢都算得出來。下一季怎麼投？",
        replies: [ { text: "全投算得出來的", lean: "perf" }, { text: "留一塊給算不出來的", lean: "brand" } ] },
      game: { type: "pick", scored: true,
        prompt: "哪一份結案報告，生意真的變大了？",
        options: [
          { title: "報告 A", lines: ["廣告報酬率 8 倍", "購買者九成是老客"] },
          { title: "報告 B", lines: ["廣告報酬率 3 倍", "購買者四成是新客"] }
        ],
        answer: 1,
        reveal: "A 的錢多半花在本來就會買的人身上。老闆會誇 A，生意變大的是 B。" },
      takeaway: "報表漂亮，不等於生意變大。",
      source: "〈未來沒有結案報告〉"
    },
    {
      year: 2019, title: "無限賽局", book: "2019 決策智慧",
      chat: { from: "老闆", text: "客戶想把投放收回去自己做。我們教不教？",
        replies: [ { text: "不教，守住發稿量", lean: "perf" }, { text: "教，改當他們的顧問", lean: "brand" } ] },
      game: { type: "slider", scored: true,
        prompt: "那家被當成轉型典範的銀行，光是打底就花了幾年？",
        min: 1, max: 10, step: 1, start: 2, unit: "年", answer: 5, tolerance: 1,
        reveal: "五年。它先花五年把技術收回自己手上，外包占比從 85% 降到 15%。" },
      takeaway: "典範花了五年，董事會只給你一季。",
      source: "〈從星展銀行 DBS 看數位轉型的成功關鍵〉"
    },
    {
      year: 2020, title: "下半場", book: "2020 決策智慧",
      chat: { from: "老闆", text: "疫情，預算砍半。剩下的錢怎麼分？",
        replies: [ { text: "全留給成效廣告", lean: "perf" }, { text: "一半以上留給品牌", lean: "brand" } ] },
      game: { type: "slider", scored: true,
        prompt: "一家運動品牌把 77% 預算放成效廣告。後來發現，多少銷售其實來自品牌活動？",
        min: 0, max: 100, step: 5, start: 25, unit: "%", answer: 65, tolerance: 10,
        reveal: "65%。它後來把比例改成品牌六、成效四。" },
      takeaway: "量得到的，不一定是最有用的。",
      source: "〈行銷計量解密〉"
    },
    {
      year: 2021, title: "穿越 2030", book: "2021 決策智慧",
      chat: { from: "平台業務", text: "追蹤工具快沒了。要不要買我們的方案，把每個人重新認出來？",
        replies: [ { text: "買，受眾不能丟", lean: "perf" }, { text: "不買，只用顧客自願給的", lean: "brand" } ] },
      game: { type: "swipe", scored: false,
        prompt: "換你當消費者。這些視窗，你會按允許嗎？",
        left: "拒絕", right: "允許",
        cards: [
          "購物網站想記住你看過的商品",
          "新聞網站想把你的瀏覽紀錄分享給 214 個合作夥伴",
          "手機遊戲想追蹤你在其他 App 的活動",
          "外送平台想知道你的精確位置，即使沒在使用"
        ],
        revealByCount: "你拒絕了 {n} 個。年鑑裡寫，年輕人有一半每個月清一次追蹤紀錄，一半裝了廣告封鎖。",
        countSide: "left" },
      takeaway: "你自己也不想被追蹤。",
      source: "〈身分識別新革命〉、2019〈掌握 Z 世代意向〉"
    },
    {
      year: 2022, title: "複合躍進", book: "2022 決策智慧",
      chat: { from: "老闆", text: "大家都在做永續宣告，我們也發一篇？",
        replies: [ { text: "發，先佔位再說", lean: "perf" }, { text: "先做到一件事再發", lean: "brand" } ] },
      game: { type: "slider", scored: true,
        prompt: "台灣消費者中，多少人覺得「省錢比救地球重要」？",
        min: 0, max: 100, step: 5, start: 40, unit: "%", answer: 81, tolerance: 10,
        reveal: "81%。同一份調查裡，85% 認為環保產品比較貴。" },
      takeaway: "說支持，和願意付錢，是兩回事。",
      source: "〈永續轉型－掌握趨勢開創新局〉"
    },
    {
      year: 2023, title: "賦能進化", book: "2023 決策智慧",
      chat: { from: "客戶", text: "AI 可以做十倍素材，製作費砍一半可以吧？",
        replies: [ { text: "可以，全交給 AI", lean: "perf" }, { text: "AI 打草稿，定稿留給人", lean: "brand" } ] },
      game: { type: "swipe", scored: true,
        prompt: "這句文案，是人寫的還是 AI 寫的？",
        left: "人寫的", right: "AI 寫的",
        cards: [
          "早上那一口，是今天第一件為自己做的事。",
          "不必很厲害才開始，開始了才會很厲害。",
          "把複雜留給我們，把週末還給你。",
          "有些味道，一喝就回到阿嬤家的廚房。"
        ],
        answers: ["right", "right", "right", "right"],
        reveal: "四句都是 AI 寫的。猜對幾句不重要，重要的是你分不出來。" },
      takeaway: "內容不用錢之後，稀缺的是被記得。",
      source: "〈從內容到溝通的 AI 轉變〉"
    },
    {
      year: 2024, title: "毒蘋果", book: "2024 決策智慧",
      chat: { from: "成長長", text: "通路的廣告平台能從曝光追到結帳，數字超乾淨。品牌預算轉過去？",
        replies: [ { text: "全轉，終於算得清楚", lean: "perf" }, { text: "先試一點，自己做對照", lean: "brand" } ] },
      game: { type: "pick", scored: true,
        prompt: "在通路的廣告平台上，「這筆訂單是廣告的功勞」由誰判定？",
        options: [
          { title: "品牌自己", lines: [] },
          { title: "通路平台", lines: [] },
          { title: "獨立第三方", lines: [] }
        ],
        answer: 1,
        reveal: "通路平台。賣你廣告的人，同時替廣告打分數，也握著你的顧客資料。" },
      takeaway: "小心球員兼裁判。",
      source: "〈RMN 來了：台灣行銷市場的特效藥 或 毒蘋果？〉"
    },
    {
      year: 2025, title: "自動打仗", book: "2025 決策智慧",
      chat: { from: "平台業務", text: "開自動優化吧，讓 AI 自己打仗，人工調只會拖慢它。",
        replies: [ { text: "開，目標設報酬率", lean: "perf" }, { text: "開，但目標改成新客", lean: "brand" } ] },
      game: { type: "stop", scored: true,
        prompt: "自動優化開始跑了。你覺得該停的時候，按下去。",
        ticks: 12, intervalMs: 700,
        report: { label: "報表成效", start: 100, perTick: 15 },
        fresh: { label: "新客比例", start: 40, perTick: -3, unit: "%" },
        goodUntilTick: 4,
        revealStopped: "你在新客比例剩 {fresh}% 時喊停，那時報表成效是 {report}。",
        revealNever: "你沒有喊停。報表成效 {report}，新客比例只剩 {fresh}%。",
        reveal: "報表每一季都在創新高，所以沒有人會想按停。" },
      takeaway: "演算法只放大你本來就打得到的人。",
      source: "〈從數據幻象到品牌真相：破解影音廣告的數據陷阱〉"
    },
    {
      year: 2026, title: "真實距離", book: "2026 決策智慧",
      chat: { from: "老闆", text: "現在大家叫 AI 幫忙挑東西。我們要先讓 AI 看見，還是先讓人記得？",
        replies: [ { text: "先讓 AI 看見", lean: "perf" }, { text: "先讓人記得", lean: "brand" } ] },
      game: { type: "agent", scored: false,
        prompt: "口渴了。你會拿哪一瓶？",
        options: [
          { title: "山嵐烏龍", lines: ["55 元", "朋友推薦過的小農茶"] },
          { title: "每日 C 1000", lines: ["39 元", "維他命 C 含量最高"] },
          { title: "零卡氣泡", lines: ["45 元", "包裝很好看"] }
        ],
        agentPick: 1,
        revealSame: "AI 代理人也選這瓶：最便宜、規格最高。你和比較表想的一樣。",
        revealDiff: "AI 代理人替你選了「每日 C 1000」：最便宜、規格最高。你選的理由，比較表上沒有那一欄。" },
      takeaway: "AI 可以幫人買東西，品牌要讓人想買。",
      source: "〈AI 可以幫人買東西，但品牌要讓人想買東西〉"
    },
    {
      year: 2027, title: "衡斷", book: "終章", finale: true,
      chat: { from: "財務長", text: "那台讓報表漂亮了十年的自動引擎，被發現對某些客人定比較高的價。關不關？",
        replies: [ { text: "不關，數字不能掉", lean: "perf" }, { text: "關，這個不能交給機器", lean: "brand" } ] },
      takeaway: "十年前相信數據能取代判斷。十年後的結論是：判斷不能外包。",
      source: "2026〈AI 普及下的演算法世代，「衡斷力」將成為最稀缺的競爭力〉"
    }
  ],
  personas: [
    { id: "judge", name: "衡斷者", rule: "score >= 5 且 3 <= perf <= 7",
      strength: "你不選邊，你看證據。", blind: "你很慢，而且常常是會議裡掃興的那個人。",
      read: "2026〈「衡斷力 (Judgment)」將成為最稀缺的競爭力〉" },
    { id: "hunter", name: "報表獵人", rule: "perf >= 7",
      strength: "你讓每一塊錢都有交代。", blind: "你容易把本來就會買的人，算成自己的功勞。",
      read: "2025〈從數據幻象到品牌真相〉" },
    { id: "believer", name: "品牌信徒", rule: "perf <= 3",
      strength: "你記得品牌是為了被人偏心。", blind: "講不出數字的時候，你的預算會先被砍。",
      read: "2020〈媒體成效和業績目標之間的關聯性〉" },
    { id: "balance", name: "平衡大師", rule: "其餘",
      strength: "你兩邊都聽得進去。", blind: "兩邊都押，兩邊都會被稀釋。",
      read: "2024〈品牌行銷的當代化〉" }
  ]
};

export default content;
