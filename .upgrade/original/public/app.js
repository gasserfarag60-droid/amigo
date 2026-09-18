/* Amigo front-end — talks to the Express backend via /api (cookie session). */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var authScreen = $("authScreen"), appScreen = $("appScreen");
  var loginView = $("loginView"), signupView = $("signupView");

  function setMsg(el, text, ok) { el.textContent = text || ""; el.className = "msg " + (ok ? "ok" : "err"); }
  function timeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) return Math.floor(s / 3600) + "h";
    return Math.floor(s / 86400) + "d";
  }

  async function api(path, method, body) {
    var res = await fetch("/api" + path, {
      method: method || "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined,
    });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  // ---- view switching ----
  $("toSignup").addEventListener("click", function () { loginView.hidden = true; signupView.hidden = false; });
  $("toLogin").addEventListener("click", function () { signupView.hidden = true; loginView.hidden = false; });
  $("forgot").addEventListener("click", function () {
    setMsg($("loginMsg"), "Password reset by email isn't set up on this server yet.", true);
  });

  // ---- signup ----
  $("signupForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      var data = await api("/register", "POST", {
        name: $("suName").value, email: $("suEmail").value, password: $("suPass").value,
      });
      enterApp(data.user);
    } catch (err) { setMsg($("signupMsg"), err.message, false); }
    finally { btn.disabled = false; }
  });

  // ---- login ----
  $("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      var data = await api("/login", "POST", { email: $("loginEmail").value, password: $("loginPass").value });
      enterApp(data.user);
    } catch (err) { setMsg($("loginMsg"), err.message, false); }
    finally { btn.disabled = false; }
  });

  // ---- logout ----
  $("logout").addEventListener("click", async function () {
    try { await api("/logout", "POST"); } catch (e) {}
    showAuth();
  });

  function showAuth() {
    appScreen.hidden = true; authScreen.hidden = false;
    $("loginForm").reset(); $("signupForm").reset();
    setMsg($("loginMsg")); setMsg($("signupMsg"));
    signupView.hidden = true; loginView.hidden = false;
  }
  function enterApp(user) {
    authScreen.hidden = true; appScreen.hidden = false;
    $("whoName").textContent = user.name;
    $("myPfp").textContent = (user.name || "?").trim().charAt(0).toUpperCase() || "🙂";
    loadPosts();
  }

  // ---- feed ----
  async function loadPosts() {
    var wrap = $("posts");
    try {
      var data = await api("/posts");
      wrap.innerHTML = "";
      data.posts.forEach(function (p) { wrap.appendChild(renderPost(p)); });
    } catch (e) { wrap.textContent = "Could not load posts."; }
  }

  function renderPost(p) {
    var el = document.createElement("div");
    el.className = "post";
    var initial = (p.authorName || "?").charAt(0).toUpperCase();
    el.innerHTML =
      '<div class="post-head"><div class="pfp">' + initial + '</div>' +
      '<div><div class="name"></div><div class="time"></div></div></div>' +
      '<div class="post-body"></div>' +
      '<div class="post-actions"><div class="act like">👍 Like (<span class="lc"></span>)</div>' +
      '<div class="act">💬 Comment</div><div class="act">↗ Share</div></div>';
    el.querySelector(".name").textContent = p.authorName;
    el.querySelector(".time").textContent = timeAgo(p.createdAt);
    el.querySelector(".post-body").textContent = p.body;
    el.querySelector(".lc").textContent = p.likeCount;
    var likeBtn = el.querySelector(".like");
    if (p.liked) likeBtn.classList.add("liked");
    likeBtn.addEventListener("click", async function () {
      try {
        var data = await api("/posts/" + p.id + "/like", "POST");
        likeBtn.classList.toggle("liked", data.post.liked);
        el.querySelector(".lc").textContent = data.post.likeCount;
      } catch (e) {}
    });
    return el;
  }

  async function addPost() {
    var input = $("postInput");
    var text = input.value.trim();
    if (!text) return;
    try {
      await api("/posts", "POST", { body: text });
      input.value = "";
      loadPosts();
    } catch (e) {}
  }
  $("postBtn").addEventListener("click", addPost);
  $("postInput").addEventListener("keydown", function (e) { if (e.key === "Enter") addPost(); });

  // ---- boot: are we already signed in? ----
  (async function boot() {
    try {
      var data = await api("/me");
      enterApp(data.user);
    } catch (e) {
      showAuth();
    }
  })();
})();
