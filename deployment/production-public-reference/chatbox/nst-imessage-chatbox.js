/*
  NST Website ChatBox Final
  Dependencies: none. Uses XMLHttpRequest for Android 4.4 compatibility.
  Expected backend:
  GET  /api/public/chatbox/settings
  POST /api/public/chatbox/start
  GET  /api/public/chatbox/thread/{id}?token=...
  POST /api/public/chatbox/thread/{id}/reply
*/
(function () {
  if (window.__NST_IMESSAGE_CHATBOX_FINAL__) return;
  window.__NST_IMESSAGE_CHATBOX_FINAL__ = true;

  var config = window.NST_CHATBOX_CONFIG || {};
  var apiBase = config.apiBase || '/api';
  var settingsUrl = apiBase.replace(/\/$/, '') + '/public/chatbox/settings';
  var startUrl = apiBase.replace(/\/$/, '') + '/public/chatbox/start';
  var threadBaseUrl = apiBase.replace(/\/$/, '') + '/public/chatbox/thread';
  var STORAGE_KEY = config.storageKey || 'nst_chatbox_public_session_v1';
  var MAX_FILES = 2;
  var MAX_TOTAL_SIZE = 10 * 1024 * 1024;
  var I18N = {
    en: {
      welcome_message: 'Assalamu Alaikum 👋\nWelcome to New Singapur Telecom support. How can we help you?',
      default_reply_after_submit: 'Thank you. Your message has reached our POS Customer Inbox. Our team will reply soon.',
      cloud_link_help_text: 'For more than 2 images, share a Google Drive / OneDrive / Dropbox link.',
      too_many_images: 'You can upload up to 2 images here. For more than 2 images, share a Google Drive, OneDrive or Dropbox link.',
      total_size_exceeded: 'Total image size can be at most 10 MB.',
      attach_use_new_request: 'To send a new attachment, use a new support request form. For more than 2 images, share a Drive/OneDrive/Dropbox link.',
      send_failed: 'Message send failed. Check the backend API/CORS settings.',
      session_missing: 'Chat session not found. Please start a new conversation.',
      open_chat: 'Open New Singapur Telecom live support',
      close_chat: 'Close chat',
      whatsapp_aria: 'Chat with New Singapur Telecom on WhatsApp (opens WhatsApp)',
      whatsapp_label: 'WhatsApp Us',
      launcher_title: 'NST Live Support',
      launcher_subtitle: 'Chat with our team',
      header_title: 'New Singapur Telecom Support',
      header_subtitle: 'Support & Sales',
      online: 'Online'
    },
    bn: {
      welcome_message: 'Assalamu Alaikum 👋\nNew Singapur Telecom support এ আপনাকে স্বাগতম। কীভাবে সাহায্য করতে পারি?',
      default_reply_after_submit: 'ধন্যবাদ। আপনার message POS Customer Inbox-এ পৌঁছে গেছে। আমাদের team দ্রুত reply করবে।',
      cloud_link_help_text: '২টির বেশি ছবি হলে Google Drive / OneDrive / Dropbox link দিন।',
      too_many_images: 'এখানে সর্বোচ্চ ২টি ছবি আপলোড করা যাবে। ২টির বেশি ছবি হলে Google Drive, OneDrive অথবা Dropbox link দিন।',
      total_size_exceeded: 'Total image size সর্বোচ্চ ১০ MB হতে পারবে।',
      attach_use_new_request: 'New attachment দিতে নতুন support request form ব্যবহার করুন। ২টির বেশি ছবি হলে Drive/OneDrive/Dropbox link দিন।',
      send_failed: 'Message send failed. Backend API/CORS check করুন।',
      session_missing: 'Chat session পাওয়া যায়নি। নতুন করে Start Conversation করুন।',
      open_chat: 'New Singapur Telecom লাইভ সাপোর্ট খুলুন',
      close_chat: 'চ্যাট বন্ধ করুন',
      whatsapp_aria: 'WhatsApp-এ New Singapur Telecom-এর সাথে চ্যাট করুন (WhatsApp খুলবে)',
      whatsapp_label: 'WhatsApp Us',
      launcher_title: 'NST Live Support',
      launcher_subtitle: 'আমাদের টিমের সাথে চ্যাট',
      header_title: 'New Singapur Telecom Support',
      header_subtitle: 'সাপোর্ট ও সেলস',
      online: 'অনলাইন'
    }
  };
  var LANG = 'en';
  try { var savedLang = window.localStorage && window.localStorage.getItem('nst_lang'); if (savedLang && I18N[savedLang]) LANG = savedLang; } catch (e) {}
  function tr(key) { return (I18N[LANG] && I18N[LANG][key]) || I18N.en[key] || ''; }
  var state = {
    settings: {
      enabled: '1',
      launcher_title: tr('launcher_title'),
      launcher_subtitle: tr('launcher_subtitle'),
      header_title: tr('header_title'),
      header_subtitle: tr('header_subtitle'),
      welcome_message: tr('welcome_message'),
      start_button_text: 'Start Conversation',
      default_reply_after_submit: tr('default_reply_after_submit'),
      attachment_help_text: 'Maximum 2 images, total 10 MB.',
      cloud_link_help_text: tr('cloud_link_help_text'),
      transcript_checkbox_text: 'Send this chat history to my email',
      consent_checkbox_text: 'I agree to be contacted by New Singapur Telecom',
      poll_seconds: '6'
    },
    session: null,
    lastThreadSignature: '',
    pollTimer: null
  };

  function byId(id) { return document.getElementById(id); }
  function trim(s) { return (s || '').replace(/^\s+|\s+$/g, ''); }
  function setText(id, text) { var el = byId(id); if (el) el.appendChild(document.createTextNode(text || '')); }
  function isOn(value, fallback) { if (value === undefined || value === null || value === '') return fallback; return /^(1|true|on|yes)$/i.test(String(value)); }
  function safeImageUrl(url) { url = trim(url); return /^(https?:\/\/|\/)[^\s"'<>]*$/.test(url) ? url : ''; }
  function safeWhatsappUrl(url) { url = trim(url); return /^https:\/\/wa\.me\/\d{8,15}(\?text=[^\s"'<>]*)?$/.test(url) ? url : ''; }
  var WA_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16.04 3C9.4 3 4 8.36 4 14.97c0 2.11.56 4.17 1.62 5.99L4 27l6.2-1.6a12.1 12.1 0 0 0 5.84 1.48C22.68 26.88 28 21.52 28 14.97 28 8.36 22.68 3 16.04 3Zm0 21.85c-1.85 0-3.66-.5-5.24-1.43l-.38-.22-3.68.95.98-3.57-.25-.37a9.86 9.86 0 0 1-1.53-5.24c0-5.48 4.6-9.93 10.1-9.93 5.47 0 9.9 4.45 9.9 9.93 0 5.47-4.43 9.88-9.9 9.88Zm5.45-7.4c-.3-.15-1.77-.86-2.04-.96-.28-.1-.48-.15-.68.15-.2.3-.78.96-.96 1.16-.18.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47a8.9 8.9 0 0 1-1.66-2.05c-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.68-1.62-.93-2.22-.24-.58-.49-.5-.68-.51h-.58c-.2 0-.52.07-.8.37-.27.3-1.04 1.01-1.04 2.47 0 1.46 1.07 2.87 1.22 3.07.15.2 2.1 3.2 5.08 4.48.71.3 1.27.49 1.7.63.72.22 1.37.19 1.88.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z"/></svg>';
  var CHAT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 12a8 8 0 1 1 3.1 6.32L4 19.5l1.1-3.3A7.96 7.96 0 0 1 4 12Z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8.5 11h7M8.5 14h4.5"/></svg>';

  function logoInto(el, fallbackHtml) {
    var url = safeImageUrl(state.settings.logo_url);
    el.innerHTML = '';
    if (url) { var img = document.createElement('img'); img.alt = ''; img.src = url; img.onerror = function () { el.innerHTML = fallbackHtml; }; el.appendChild(img); }
    else el.innerHTML = fallbackHtml;
  }

  function publishStackHeight() {
    var stack = byId('nstFloatStack'); var h = 0;
    if (stack && stack.offsetParent !== null) h = stack.offsetHeight;
    try { document.documentElement.style.setProperty('--nst-chat-stack-h', h + 'px'); } catch (e) {}
  }

  function xhrJson(method, url, formData, done) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    if (!(formData instanceof FormData) && method !== 'GET') xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        var ok = xhr.status >= 200 && xhr.status < 300;
        var json = null;
        try { json = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
        done(ok, json, xhr.status);
      }
    };
    xhr.send(formData instanceof FormData ? formData : (method === 'GET' ? null : JSON.stringify(formData || {})));
  }

  function loadSession() {
    try { var raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function saveSession(session) { state.session = session; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch (e) {} }
  function clearSession() { state.session = null; state.lastThreadSignature = ''; try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} }

  function loadSettings(done) {
    xhrJson('GET', settingsUrl, null, function (ok, json) {
      if (ok && json && json.data) {
        for (var key in json.data) if (Object.prototype.hasOwnProperty.call(json.data, key)) state.settings[key] = json.data[key];
      }
      done();
    });
  }

  function build() {
    if (byId('nstChatWidgetRoot')) return;
    var chatOn = isOn(state.settings.enabled, true);
    var waUrl = isOn(state.settings.whatsapp_business_enabled, false) ? safeWhatsappUrl(state.settings.whatsapp_link) : '';
    if (!chatOn && !waUrl) { publishStackHeight(); return; }
    var root = document.createElement('div');
    root.id = 'nstChatWidgetRoot';
    var html = '<div id="nstFloatStack" class="nst-float-stack">';
    if (waUrl) {
      html += '<a id="nstWhatsappLink" class="nst-wa-button" target="_blank" rel="noopener noreferrer">' +
        '<span class="nst-wa-icon">' + WA_ICON + '</span><span id="nstWhatsappLabel" class="nst-wa-label"></span></a>';
    }
    if (chatOn) {
      html += '<button id="nstChatLauncher" class="nst-chat-launcher" type="button" aria-haspopup="dialog" aria-controls="nstChatBox" aria-expanded="false">' +
        '<span id="nstLauncherIcon" class="nst-chat-launcher-icon"></span>' +
        '<span class="nst-chat-launcher-text"><strong id="nstLauncherTitle"></strong><small id="nstLauncherSubtitle"></small></span>' +
        '<i class="nst-chat-online" aria-hidden="true"></i>' +
      '</button>';
    }
    html += '</div>';
    if (chatOn) {
      html +=
      '<section id="nstChatBox" class="nst-chat-box" role="dialog" aria-modal="false" aria-labelledby="nstHeaderTitle" aria-hidden="true">' +
        '<header class="nst-chat-header">' +
          '<div id="nstChatAvatar" class="nst-chat-avatar"></div>' +
          '<div class="nst-chat-title"><strong id="nstHeaderTitle"></strong><span><i class="nst-chat-online-dot" aria-hidden="true"></i><em id="nstHeaderSubtitle"></em></span></div>' +
          '<button id="nstChatClose" class="nst-chat-close" type="button">×</button>' +
        '</header>' +
        '<div id="nstChatBody" class="nst-chat-body">' +
          '<div class="nst-chat-date">Today</div>' +
          '<div class="nst-msg nst-msg-agent"><div id="nstWelcomeBubble" class="nst-bubble"></div></div>' +
          '<form id="nstVisitorForm" class="nst-visitor-form">' +
            '<label><span>Your Name *</span><input type="text" id="nstName" name="name" placeholder="Enter your name" required></label>' +
            '<label><span>Phone Number *</span><input type="tel" id="nstPhone" name="phone" placeholder="01XXXXXXXXX" required></label>' +
            '<label><span>Email Address</span><input type="email" id="nstEmail" name="email" placeholder="you@example.com"></label>' +
            '<label><span>Your Message *</span><textarea id="nstFirstMessage" name="message" rows="3" placeholder="Write your message..." required></textarea></label>' +
            '<label><span>Attach Images</span><input type="file" id="nstImages" name="attachments[]" accept="image/jpeg,image/png,image/webp" multiple><small id="nstAttachmentHelp" class="nst-help-text"></small></label>' +
            '<label><span>More images link</span><input type="url" id="nstCloudLink" name="cloud_link" placeholder="Google Drive / OneDrive / Dropbox link"><small id="nstCloudLinkHelp" class="nst-help-text"></small></label>' +
            '<label class="nst-check"><input type="checkbox" id="nstTranscript" name="wants_transcript_email" checked><span id="nstTranscriptText"></span></label>' +
            '<label class="nst-check"><input type="checkbox" id="nstConsent" name="contact_consent" required><span id="nstConsentText"></span></label>' +
            '<button id="nstStartBtn" class="nst-start-btn" type="submit"></button>' +
          '</form>' +
          '<div id="nstConversation" class="nst-conversation nst-hidden"></div>' +
        '</div>' +
        '<footer id="nstChatFooter" class="nst-chat-footer nst-hidden">' +
          '<button id="nstAttachBtn" class="nst-icon-btn" type="button" aria-label="Attach image">＋</button>' +
          '<input id="nstReplyInput" class="nst-reply-input" type="text" placeholder="Message..." autocomplete="off" aria-label="Message">' +
          '<button id="nstSendBtn" class="nst-send-btn" type="button" aria-label="Send message">↑</button>' +
        '</footer>' +
      '</section>';
    }
    root.innerHTML = html;
    document.body.appendChild(root);
    if (waUrl) {
      var wa = byId('nstWhatsappLink');
      wa.href = waUrl;
      wa.setAttribute('aria-label', tr('whatsapp_aria'));
      setText('nstWhatsappLabel', trim(state.settings.whatsapp_button_label) || tr('whatsapp_label'));
    }
    if (chatOn) {
      byId('nstChatLauncher').setAttribute('aria-label', tr('open_chat'));
      byId('nstChatClose').setAttribute('aria-label', tr('close_chat'));
      logoInto(byId('nstLauncherIcon'), CHAT_ICON);
      logoInto(byId('nstChatAvatar'), 'NST');
      applySettingsText();
      wire();
      state.session = loadSession();
      if (state.session && state.session.id && state.session.token) restoreExistingThread();
    }
    publishStackHeight();
    window.addEventListener('resize', publishStackHeight);
  }

  function applySettingsText() {
    setText('nstLauncherTitle', trim(state.settings.launcher_title) || tr('launcher_title'));
    setText('nstLauncherSubtitle', trim(state.settings.launcher_subtitle) || tr('launcher_subtitle'));
    setText('nstHeaderTitle', trim(state.settings.header_title) || tr('header_title'));
    setText('nstHeaderSubtitle', trim(state.settings.header_subtitle) || tr('header_subtitle'));
    setText('nstWelcomeBubble', trim(state.settings.welcome_message) || tr('welcome_message'));
    setText('nstAttachmentHelp', state.settings.attachment_help_text || 'Maximum 2 images, total 10 MB.');
    setText('nstCloudLinkHelp', state.settings.cloud_link_help_text || 'More images? Share cloud link.');
    setText('nstTranscriptText', state.settings.transcript_checkbox_text || 'Send this chat history to my email');
    setText('nstConsentText', state.settings.consent_checkbox_text || 'I agree to be contacted');
    setText('nstStartBtn', trim(state.settings.start_button_text) || 'Start Conversation');
  }

  function openChat() {
    var box = byId('nstChatBox'); if (box.className.indexOf(' is-open') === -1) box.className += ' is-open'; box.setAttribute('aria-hidden', 'false');
    var launcher = byId('nstChatLauncher'); launcher.setAttribute('aria-expanded', 'true');
    var root = byId('nstChatWidgetRoot'); if (root.className.indexOf('is-chat-open') === -1) root.className += ' is-chat-open';
    scrollToBottom();
    setTimeout(function () { var first = byId('nstName'); var reply = byId('nstReplyInput'); var target = (reply && reply.offsetParent !== null) ? reply : first; if (target && target.focus) try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }, 200);
  }
  function closeChat() {
    var box = byId('nstChatBox'); box.className = box.className.replace(' is-open', ''); box.setAttribute('aria-hidden', 'true');
    var launcher = byId('nstChatLauncher'); launcher.setAttribute('aria-expanded', 'false');
    var root = byId('nstChatWidgetRoot'); root.className = root.className.replace(/\s*is-chat-open/g, '');
    launcher.focus();
  }
  function scrollToBottom() { setTimeout(function () { var body = byId('nstChatBody'); if (body) body.scrollTop = body.scrollHeight; }, 50); }
  function showConversationMode() { var form = byId('nstVisitorForm'); var conversation = byId('nstConversation'); var footer = byId('nstChatFooter'); if (form && form.className.indexOf('nst-hidden') === -1) form.className += ' nst-hidden'; if (conversation) conversation.className = conversation.className.replace(' nst-hidden', ''); if (footer) footer.className = footer.className.replace(' nst-hidden', ''); }

  function addMessage(text, sender) {
    var conversation = byId('nstConversation'); if (!conversation) return;
    var msg = document.createElement('div'); msg.className = 'nst-msg ' + (sender === 'user' ? 'nst-msg-user' : 'nst-msg-agent');
    var bubble = document.createElement('div'); bubble.className = 'nst-bubble'; bubble.appendChild(document.createTextNode(text || ''));
    msg.appendChild(bubble); conversation.appendChild(msg); scrollToBottom();
  }

  function renderThread(threadData) {
    if (!threadData || !threadData.thread) return;
    var signature = JSON.stringify(threadData.thread.map(function (item) { return [(item.sender_type || ''), (item.message || ''), (item.created_at || ''), (item.cloud_link || '')].join('|'); }));
    if (signature === state.lastThreadSignature) return;
    state.lastThreadSignature = signature;
    showConversationMode();
    var conversation = byId('nstConversation'); conversation.innerHTML = '';
    for (var i = 0; i < threadData.thread.length; i++) {
      var item = threadData.thread[i];
      var sender = item.sender_type === 'staff' ? 'agent' : 'user';
      addMessage(item.message || '', sender);
      if (item.cloud_link) addMessage('Cloud link: ' + item.cloud_link, sender);
      if (item.attachments && item.attachments.length) addMessage('Attachment: ' + item.attachments.length + ' image(s)', sender);
    }
  }

  function addNotice(text) {
    var target = byId('nstVisitorForm') || byId('nstConversation'); if (!target) return;
    var note = document.createElement('div'); note.className = 'nst-chat-warning'; note.appendChild(document.createTextNode(text)); target.appendChild(note);
    setTimeout(function () { if (note && note.parentNode) note.parentNode.removeChild(note); }, 6000);
  }

  function validateImages(files) {
    var totalSize = 0; if (!files) return true;
    if (files.length > MAX_FILES) { addNotice(tr('too_many_images')); byId('nstImages').value = ''; return false; }
    for (var i = 0; i < files.length; i++) { totalSize += files[i].size || 0; if (files[i].type && !/^image\/(jpeg|png|webp)$/.test(files[i].type)) { addNotice('Only JPG, PNG, or WEBP images are allowed.'); byId('nstImages').value = ''; return false; } }
    if (totalSize > MAX_TOTAL_SIZE) { addNotice(tr('total_size_exceeded')); byId('nstImages').value = ''; return false; }
    return true;
  }

  function fetchThread(done) {
    if (!state.session || !state.session.id || !state.session.token) { if (done) done(false); return; }
    var url = threadBaseUrl + '/' + encodeURIComponent(state.session.id) + '?token=' + encodeURIComponent(state.session.token);
    xhrJson('GET', url, null, function (ok, json) {
      if (ok && json && json.data) {
        renderThread(json.data);
        saveSession({ id: json.data.id, token: json.data.token, ticket_no: json.data.ticket_no, updated_at: json.data.updated_at || '' });
        if (done) done(true); return;
      }
      if (json && json.message === 'Chat session not found.') clearSession();
      if (done) done(false);
    });
  }
  function restoreExistingThread() { fetchThread(function () { startPolling(); }); }
  function startPolling() { stopPolling(); var sec = parseInt(state.settings.poll_seconds || '6', 10); if (!sec || sec < 4) sec = 6; state.pollTimer = setInterval(function () { if (state.session && state.session.id && state.session.token) fetchThread(); }, sec * 1000); }
  function stopPolling() { if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; } }

  function wire() {
    byId('nstChatLauncher').onclick = function () { if (byId('nstChatBox').className.indexOf(' is-open') === -1) openChat(); else closeChat(); };
    byId('nstChatClose').onclick = closeChat;
    document.addEventListener('keydown', function (event) { if ((event.key === 'Escape' || event.keyCode === 27) && byId('nstChatBox').className.indexOf(' is-open') !== -1) closeChat(); });
    byId('nstAttachBtn').onclick = function () { addMessage(tr('attach_use_new_request'), 'agent'); };
    byId('nstImages').onchange = function () { validateImages(byId('nstImages').files); };
    byId('nstVisitorForm').onsubmit = function (event) {
      event.preventDefault();
      var files = byId('nstImages').files; if (!validateImages(files)) return;
      var name = trim(byId('nstName').value), phone = trim(byId('nstPhone').value), email = trim(byId('nstEmail').value), message = trim(byId('nstFirstMessage').value), cloudLink = trim(byId('nstCloudLink').value), wantsTranscript = byId('nstTranscript').checked, consent = byId('nstConsent').checked;
      if (!name || !phone || !message || !consent) { addNotice('Name, phone, message and consent are required.'); return; }
      var fd = new FormData(); fd.append('name', name); fd.append('phone', phone); if (email) fd.append('email', email); fd.append('subject', 'Website Chat'); fd.append('category', 'website_chat'); fd.append('message', message); if (cloudLink) fd.append('cloud_link', cloudLink); fd.append('wants_transcript_email', wantsTranscript ? '1' : '0'); fd.append('contact_consent', consent ? '1' : '0');
      if (files) for (var i = 0; i < files.length && i < MAX_FILES; i++) fd.append('attachments[]', files[i]);
      var btn = byId('nstStartBtn'); btn.disabled = true; btn.textContent = 'Sending...';
      xhrJson('POST', startUrl, fd, function (ok, json) {
        btn.disabled = false; btn.textContent = trim(state.settings.start_button_text) || 'Start Conversation';
        if (!ok || !json || !json.data) { addNotice((json && json.message) ? json.message : tr('send_failed')); return; }
        saveSession({ id: json.data.id, token: json.data.token, ticket_no: json.data.ticket_no, updated_at: json.data.updated_at || '' });
        renderThread(json.data); addMessage(trim(state.settings.default_reply_after_submit) || tr('default_reply_after_submit'), 'agent'); startPolling();
      });
    };
    byId('nstSendBtn').onclick = function () {
      var input = byId('nstReplyInput'); var text = trim(input.value); if (!text) return;
      if (!state.session || !state.session.id || !state.session.token) { addNotice(tr('session_missing')); return; }
      var fd = new FormData(); fd.append('token', state.session.token); fd.append('message', text); input.value = '';
      var url = threadBaseUrl + '/' + encodeURIComponent(state.session.id) + '/reply';
      xhrJson('POST', url, fd, function (ok, json) { if (!ok || !json || !json.data) { addNotice((json && json.message) ? json.message : 'Reply send failed.'); return; } renderThread(json.data); startPolling(); });
    };
    byId('nstReplyInput').onkeydown = function (event) { event = event || window.event; if (event.keyCode === 13) { if (event.preventDefault) event.preventDefault(); byId('nstSendBtn').onclick(); return false; } };
    window.addEventListener('beforeunload', function () { stopPolling(); });
  }

  loadSettings(function () { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build(); });
})();
