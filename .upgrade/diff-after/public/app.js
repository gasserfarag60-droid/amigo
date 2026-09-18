(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const dictionary = {
    skip:["Skip to content","انتقل للمحتوى"],loading:["Getting things ready…","بنجهّز لك المكان…"],
    eyebrow:["YOUR PEOPLE. YOUR PLACE.","ناسك. مكانك."],headline1:["Life's better","الدنيا أحلى"],headline2:["together.","مع بعض."],
    heroCopy:["Big moments. Small updates. All the things that bring you closer to your people.","لحظات كبيرة وتفاصيل صغيرة. شارك كل اللي بيقرّبك من الناس اللي بتحبهم."],
    caption:["A little more you. A little more connected.","على طبيعتك. وقريب من ناسك."],welcome:["WELCOME BACK","نورت من تاني"],
    loginTitle:["Your people missed you.","ناسك مستنيينك."],loginSub:["Log in and pick up where you left off.","سجّل دخولك وكمّل الحكاية."],
    email:["Email address","البريد الإلكتروني"],password:["Password","كلمة المرور"],show:["Show","إظهار"],hide:["Hide","إخفاء"],
    login:["Log in","تسجيل الدخول"],newHere:["NEW HERE?","أول مرة هنا؟"],create:["Create an account","اعمل حساب جديد"],
    authNote:["Your password is hashed, never stored as plain text.","كلمة مرورك بتتخزّن كهاش، مش كنص مكشوف."],
    back:["Back to log in","ارجع لتسجيل الدخول"],join:["FIND YOUR PEOPLE","قرّب من ناسك"],
    signupTitle:["Make yourself at home.","مكانك وسطنا."],signupSub:["A new connection starts with a hello.","كل حكاية جديدة بتبدأ بسلام."],
    name:["Your name","اسمك"],passwordHint:["Use a unique passphrase: 12+ characters, up to 72 UTF-8 bytes.","استخدم عبارة مرور مميزة: 12 حرف أو أكتر، بحد أقصى 72 بايت UTF-8."],
    signup:["Create my account","إنشاء حسابي"],signupNote:["Only use a password that's unique to Amigo.","استخدم كلمة مرور خاصة بـ Amigo، مش مستخدمها في موقع تاني."],
    yourSpace:["Your little corner of Amigo","مساحتك الخاصة في Amigo"],home:["Home feed","آخر الأخبار"],myPosts:["My posts","منشوراتي"],
    logout:["Log out","تسجيل الخروج"],yourDaily:["YOUR DAILY DOSE OF CONNECTION","خليك قريب كل يوم"],
    feedTitle:["The good company feed.","كل جديد من ناسك."],shareMoment:["Got a moment to share?","عندك لحظة تحب تشاركها؟"],
    post:["Share a moment","شارك لحظتك"],emptyTitle:["A fresh start.","بداية جديدة."],
    emptyCopy:["No moments here yet. Share something, or try another search.","لسه مفيش منشورات هنا. شارك أول لحظة، أو جرّب بحث تاني."],
    smallThings:["IT'S THE SMALL THINGS","التفاصيل الصغيرة بتفرق"],discoverTitle:["A hello can go a long way.","سلام منك ممكن يفرق."],
    discoverCopy:["Share a thought. Celebrate a win. Let your people know you're thinking of them.","شارك فكرة. احتفل بإنجاز. وخلّي ناسك يعرفوا إنهم على بالك."],
    tipTitle:["Make this space yours","خلّي المكان يشبهك"],
    tipCopy:["Find posts with search, like a moment, or copy a link to share it with another Amigo member.","دوّر على منشور، اعمل إعجاب بلحظة حلوة، أو انسخ رابط وشاركه مع عضو تاني في Amigo."],
    footer:["Real moments. Meaningful connections.","لحظات حقيقية. وناس قريبة."],footerEnd:["A space to be yourself","مكان تكون فيه على طبيعتك"],
    working:["Just a moment…","لحظة واحدة…"],network:["Connection problem. Please try again.","في مشكلة في الاتصال. جرّب تاني."],
    timedOut:["That took too long. Check your connection and try again.","الاتصال أخد وقت طويل. راجع الإنترنت وجرّب تاني."],
    expired:["Your session ended. Please log in again.","الجلسة انتهت. سجّل دخولك من جديد."],
    like:["Like","إعجاب"],share:["Copy link","نسخ الرابط"],delete:["Delete","حذف"],
    confirmDelete:["Delete this post? This cannot be undone.","تحذف المنشور ده؟ الحذف نهائي."],
    copied:["Link copied. Share it with another Amigo member.","الرابط اتنسخ. شاركه مع عضو تاني في Amigo."],
    clipboard:["Copy this link: ","انسخ الرابط ده: "],posted:["Your moment is live.","لحظتك اتنشرت."],
    deleted:["Post deleted.","المنشور اتحذف."],justNow:["Just now","حالًا"],
    searchPlaceholder:["Find a moment or a friend…","دوّر على لحظة أو صديق…"],postPlaceholder:["What's on your mind?","إيه اللي على بالك؟"],
    namePlaceholder:["How should we call you?","تحب نناديك بإيه؟"],passwordPlaceholder:["Your password","كلمة مرورك"],
    newPasswordPlaceholder:["Create a strong passphrase","اكتب عبارة مرور قوية"],refresh:["Refresh posts","تحديث المنشورات"],
    theme:["Switch color theme","تغيير ألوان الموقع"],byteLimit:["Use 12+ characters and no more than 72 UTF-8 bytes.","استخدم 12 حرف على الأقل، وبحد أقصى 72 بايت UTF-8."]
  };
  let lang = "en", user = null, csrf = "", posts = [], onlyMine = false, feedLoad = 0, toastTimer;
  try { lang = localStorage.getItem("amigo-language") === "ar" ? "ar" : "en"; } catch {}
  const t = key => dictionary[key]?.[lang === "ar" ? 1 : 0] || key;
  function persist(key, value) { try { localStorage.setItem(key, value); } catch {} }
  let theme;
  try { theme = localStorage.getItem("amigo-theme"); } catch {}
  document.documentElement.dataset.theme = theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  function message(id, text = "") { $(id).textContent = text; }
  function toast(text) {
    $("toast").textContent = text; $("toast").hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $("toast").hidden = true; }, 6000);
  }
  function translate() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    $("languageToggle").textContent = lang === "en" ? "العربية" : "English";
    $("languageToggle").lang = lang === "en" ? "ar" : "en";
    $("languageToggle").setAttribute("aria-label", lang === "en" ? "Switch to Arabic" : "Switch to English");
    [["searchPosts","searchPlaceholder"],["postInput","postPlaceholder"],["suName","namePlaceholder"],["loginPass","passwordPlaceholder"],["suPass","newPasswordPlaceholder"]].forEach(([id,key]) => { $(id).placeholder = t(key); });
    $("searchPosts").setAttribute("aria-label", t("searchPlaceholder"));
    for (const [id,key] of [["themeToggle","theme"],["refreshPosts","refresh"]]) { $(id).title=t(key); $(id).setAttribute("aria-label",t(key)); }
    document.querySelectorAll("[data-password]").forEach(button => { button.textContent=t($(button.dataset.password).type === "password" ? "show" : "hide"); });
    if (user) renderPosts();
  }
  $("languageToggle").addEventListener("click", () => { lang = lang === "en" ? "ar" : "en"; persist("amigo-language",lang); translate(); });
  $("themeToggle").addEventListener("click", () => { const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme=next; persist("amigo-theme",next); });
  document.querySelectorAll("[data-password]").forEach(button => button.addEventListener("click", () => {
    const field = $(button.dataset.password), visible = field.type === "password";
    field.type = visible ? "text" : "password"; button.setAttribute("aria-pressed",String(visible)); button.textContent=t(visible ? "hide" : "show");
  }));
  function resetPasswords() {
    document.querySelectorAll("[data-password]").forEach(button => { $(button.dataset.password).type="password"; button.setAttribute("aria-pressed","false"); button.textContent=t("show"); });
    $("passwordMeter").value=0;
    $("suPass").setCustomValidity("");
  }
  function changeView(signup) {
    $("loginView").hidden=signup; $("signupView").hidden=!signup;
    $("loginForm").reset(); $("signupForm").reset(); resetPasswords();
    message("loginMsg"); message("signupMsg"); $(signup ? "suName" : "loginEmail").focus();
  }
  $("toSignup").addEventListener("click", () => changeView(true));
  $("toLogin").addEventListener("click", () => changeView(false));
  function showAuth() {
    user=null; posts=[]; feedLoad++; $("posts").replaceChildren();
    $("appScreen").hidden=true; $("authScreen").hidden=false; $("bootScreen").hidden=true;
    $("loginForm").reset(); $("signupForm").reset(); resetPasswords();
    $("signupView").hidden=true; $("loginView").hidden=false;
    $("postInput").value=""; $("searchPosts").value=""; message("loginMsg"); message("signupMsg"); updateCount();
  }
  async function api(route, method="GET", body) {
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
    try {
      const res=await fetch("/api"+route, {method,credentials:"same-origin",signal:controller.signal,
        headers: { ...(method !== "GET" ? {"Content-Type":"application/json","X-CSRF-Token":csrf} : {}) },
        body:body===undefined?undefined:JSON.stringify(body)});
      let data; try {data=await res.json()} catch {throw new Error(t("network"))}
      if (data.csrfToken) csrf=data.csrfToken;
      if (!res.ok) {
        if (res.status===401 && user && !["/login","/register"].includes(route)) {showAuth();toast(t("expired"));}
        if (data.code==="CSRF") csrf="";
        throw new Error(data.error || t("network"));
      }
      return data;
    } catch (error) {
      if (error.name==="AbortError") throw new Error(t("timedOut"));
      if (error instanceof TypeError) throw new Error(t("network"));
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async function ensureCsrf() { if(!csrf) await api("/csrf"); }
  async function busy(button, fn) {
    if(button.disabled) return;
    button.disabled=true; button.setAttribute("aria-busy","true");
    try {await fn()} finally {button.disabled=false; button.removeAttribute("aria-busy");}
  }
  function enterApp(nextUser) {
    user=nextUser; $("bootScreen").hidden=true; $("authScreen").hidden=true; $("appScreen").hidden=false;
    $("loginForm").reset(); $("signupForm").reset(); resetPasswords();
    $("whoName").textContent=user.name; $("whoEmail").textContent=user.email; $("myPfp").textContent=Array.from(user.name)[0]?.toUpperCase() || "A";
    onlyMine=false; setFilter(false); updateCount(); loadPosts();
  }
  $("suPass").addEventListener("input", () => {
    const value=$("suPass").value, bytes=new TextEncoder().encode(value).length;
    $("suPass").setCustomValidity(bytes > 72 ? t("byteLimit") : "");
    $("passwordMeter").value=bytes>72?0:Math.min(4,Math.floor(value.length/5));
  });
  for(const signup of [false,true]) {
    $(signup?"signupForm":"loginForm").addEventListener("submit", async event => {
      event.preventDefault();
      const form=event.currentTarget, button=form.querySelector('button[type="submit"]'), msg=signup?"signupMsg":"loginMsg";
      await busy(button, async () => {
        message(msg);
        try {
          await ensureCsrf();
          const body=signup ? {name:$("suName").value,email:$("suEmail").value,password:$("suPass").value} : {email:$("loginEmail").value,password:$("loginPass").value};
          const data=await api(signup?"/register":"/login","POST",body);
          enterApp(data.user);
        } catch(error) { message(msg,error.message); }
      });
    });
  }
  $("logout").addEventListener("click", () => busy($("logout"), async () => {
    try { await ensureCsrf(); await api("/logout","POST",{}); csrf=""; showAuth(); $("loginEmail").focus(); }
    catch(error) {toast(error.message)}
  }));
  function relative(ts) {
    const seconds=Math.max(0,Math.floor((Date.now()-ts)/1000));
    if(seconds<60) return t("justNow");
    const formatter=new Intl.RelativeTimeFormat(lang,{numeric:"auto"});
    if(seconds<3600) return formatter.format(-Math.floor(seconds/60),"minute");
    if(seconds<86400) return formatter.format(-Math.floor(seconds/3600),"hour");
    return formatter.format(-Math.floor(seconds/86400),"day");
  }
  async function loadPosts() {
    const version=++feedLoad;
    $("posts").setAttribute("aria-busy","true"); message("feedMsg",t("loading"));
    try {
      const data=await api("/posts");
      if(version!==feedLoad || !user) return;
      posts=data.posts; renderPosts(); message("feedMsg");
      if(location.hash.startsWith("#post-")) document.getElementById(location.hash.slice(1))?.scrollIntoView({block:"center"});
    } catch(error) { if(version===feedLoad) message("feedMsg",error.message); }
    finally { if(version===feedLoad) $("posts").setAttribute("aria-busy","false"); }
  }
  function renderPosts() {
    const query=$("searchPosts").value.trim().toLocaleLowerCase();
    const visible=posts.filter(p=>(!onlyMine||p.mine) && (p.body+" "+p.authorName).toLocaleLowerCase().includes(query));
    const fragment=document.createDocumentFragment();
    visible.forEach(p=>fragment.appendChild(renderPost(p)));
    $("posts").replaceChildren(fragment); $("emptyState").hidden=visible.length!==0;
  }
  function renderPost(post) {
    const el=$("postTemplate").content.firstElementChild.cloneNode(true);
    el.id="post-"+post.id;
    el.querySelector(".avatar").textContent=Array.from(post.authorName)[0]?.toUpperCase() || "A";
    el.querySelector(".post-name").textContent=post.authorName;
    const time=el.querySelector(".post-time"); time.dateTime=new Date(post.createdAt).toISOString();time.textContent=relative(post.createdAt);time.title=new Date(post.createdAt).toLocaleString(lang);
    el.querySelector(".post-body").textContent=post.body;
    const like=el.querySelector(".like-button"), count=el.querySelector(".like-count"), heart=el.querySelector(".heart-icon");
    function updateLike(){like.setAttribute("aria-pressed",String(post.liked));count.textContent=post.likeCount;heart.textContent=post.liked?"♥":"♡";}
    updateLike();el.querySelector(".like-label").textContent=t("like");
    like.addEventListener("click",()=>busy(like,async()=>{
      try{await ensureCsrf();const data=await api("/posts/"+encodeURIComponent(post.id)+"/like","POST",{});Object.assign(post,data.post);updateLike();}
      catch(error){toast(error.message)}
    }));
    const remove=el.querySelector(".delete-post");remove.hidden=!post.mine;remove.textContent=t("delete");
    remove.addEventListener("click",()=>{
      if(!confirm(t("confirmDelete"))) return;
      busy(remove,async()=>{
        try{await ensureCsrf();await api("/posts/"+encodeURIComponent(post.id),"DELETE",{});posts=posts.filter(p=>p.id!==post.id);renderPosts();toast(t("deleted"));}
        catch(error){toast(error.message)}
      });
    });
    el.querySelector(".share-label").textContent=t("share");
    el.querySelector(".share-button").addEventListener("click",async()=>{
      const url=location.origin+"/#post-"+encodeURIComponent(post.id);
      try{await navigator.clipboard.writeText(url);toast(t("copied"));}
      catch{toast(t("clipboard")+url)}
    });
    return el;
  }
  function setFilter(mine) {
    onlyMine=mine;
    for(const [id,active] of [["allPosts",!mine],["myPosts",mine]]) {$(id).classList.toggle("active",active);$(id).setAttribute("aria-pressed",String(active));}
    renderPosts();
  }
  $("allPosts").addEventListener("click",()=>setFilter(false));
  $("myPosts").addEventListener("click",()=>setFilter(true));
  $("searchPosts").addEventListener("input",renderPosts);
  $("refreshPosts").addEventListener("click",()=>busy($("refreshPosts"),loadPosts));
  function updateCount(){const value=$("postInput").value;$("postCount").textContent=value.length+" / 2000";$("postBtn").disabled=!value.trim();}
  $("postInput").addEventListener("input",updateCount);
  $("postInput").addEventListener("keydown",event=>{if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();$("postForm").requestSubmit();}});
  $("postForm").addEventListener("submit",async event=>{
    event.preventDefault();const body=$("postInput").value.trim();if(!body)return;
    await busy($("postBtn"),async()=>{
      try {await ensureCsrf();const data=await api("/posts","POST",{body});posts.unshift(data.post);$("postInput").value="";$("searchPosts").value="";renderPosts();toast(t("posted"));}
      catch(error){toast(error.message)}
    });
    updateCount();
  });
  $("year").textContent=new Date().getFullYear();
  translate();
  (async()=>{
    try {await api("/csrf");const data=await api("/me");enterApp(data.user);}
    catch(error){showAuth();if(error.message!== "Please log in to continue." && error.message!=="Please log in again.") message("loginMsg",error.message);}
  })();
})();
