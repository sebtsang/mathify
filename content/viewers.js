// content/viewers.js
// Injects 12 Gemini-generated fake "Who viewed your profile" rows above the
// real list on /me/profile-views. The page is private to the user, so the
// fakes are uncross-checkable by anyone — on-concept.
(function () {
  if (window.__mathifyViewersLoaded) return;
  window.__mathifyViewersLoaded = true;

  const MARK = "data-mathify-injected-viewers";
  let injecting = false;

  function shouldRun() {
    return /\/me\/profile-views/.test(location.pathname);
  }

  function findMain() {
    return (
      document.querySelector('main[role="main"]') ||
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.querySelector(".scaffold-layout__main") ||
      document.querySelector("#main") ||
      null
    );
  }

  function avatarColor(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
    const hue = Math.abs(h) % 360;
    return `hsl(${hue}, 45%, 50%)`;
  }

  function timeAgo(i) {
    const options = [
      "1 hour ago", "2 hours ago", "3 hours ago", "5 hours ago",
      "Today", "Yesterday", "2 days ago", "3 days ago",
      "4 days ago", "1 week ago", "1 week ago", "2 weeks ago",
    ];
    return options[i % options.length];
  }

  function buildRow(v, i) {
    const li = document.createElement("li");
    li.className = "mathify-viewer-row";
    li.setAttribute("data-mathify-skip", "1");

    const avatar = document.createElement("div");
    avatar.className = "mathify-viewer-avatar";
    const initials = v.name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase();
    avatar.textContent = initials;
    avatar.style.background = avatarColor(v.name);

    const text = document.createElement("div");
    text.className = "mathify-viewer-text";

    const name = document.createElement("div");
    name.className = "mathify-viewer-name";
    name.textContent = v.name;

    const headline = document.createElement("div");
    headline.className = "mathify-viewer-headline";
    headline.textContent = v.headline;

    const when = document.createElement("div");
    when.className = "mathify-viewer-when";
    when.textContent = timeAgo(i);

    text.appendChild(name);
    text.appendChild(headline);
    text.appendChild(when);

    li.appendChild(avatar);
    li.appendChild(text);
    return li;
  }

  function inject(main, viewers) {
    const section = document.createElement("section");
    section.setAttribute(MARK, "1");
    section.setAttribute("data-mathify-skip", "1");
    section.className = "mathify-viewers-section";

    const header = document.createElement("div");
    header.className = "mathify-viewers-header";
    header.setAttribute("data-mathify-skip", "1");
    header.innerHTML =
      '<span class="mathify-viewers-title">Recent profile viewers</span>' +
      '<span class="mathify-viewers-badge">Private to you</span>';
    section.appendChild(header);

    const list = document.createElement("ul");
    list.className = "mathify-viewers-list";
    list.setAttribute("data-mathify-skip", "1");

    viewers.forEach((v, i) => list.appendChild(buildRow(v, i)));
    section.appendChild(list);

    main.insertBefore(section, main.firstChild);
  }

  async function maybeInject() {
    if (!shouldRun()) {
      removeInjected();
      return;
    }
    if (injecting) return;
    if (document.querySelector(`[${MARK}]`)) return; // already injected
    if (!window.__mathifyGemini) {
      console.log("[mathify] viewers: gemini not loaded yet");
      return;
    }

    const settings = await new Promise((r) =>
      chrome.storage.local.get({ enabled: true, injectViewers: true }, r)
    );
    if (!settings.enabled || !settings.injectViewers) {
      removeInjected();
      return;
    }

    injecting = true;
    try {
      const main = findMain();
      if (!main) {
        console.warn("[mathify] viewers: no main element found on", location.pathname);
        return;
      }
      const viewers = await window.__mathifyGemini.getFakeViewers();
      if (!viewers || !viewers.length) {
        console.warn("[mathify] viewers: empty viewer list");
        return;
      }
      if (!shouldRun()) return;
      if (document.querySelector(`[${MARK}]`)) return;
      inject(main, viewers);
      console.log(
        "[mathify] viewers: injected",
        viewers.length,
        "into",
        main.tagName,
        main.className || "(no class)"
      );
    } catch (e) {
      console.error("[mathify] viewers inject error", e);
    } finally {
      injecting = false;
    }
  }

  function removeInjected() {
    document.querySelectorAll(`[${MARK}]`).forEach((el) => el.remove());
  }

  window.__mathifyViewers = { maybeInject, removeInjected };
  console.log("[mathify] viewers.js loaded");
})();
