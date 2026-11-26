(function ($, window, document) {
  "use strict";

  var CONFIG = {
    HUBSPOT: {
      PORTAL_ID: "343950765",
      FORM_GUID: "26b422a5-1927-4ce6-b515-77c67baf127e",
      REGION: "na1",
      FIELD_MAP: {
        firstname: "firstname",
        lastname: "lastname",
        email: "email",
        company: ["company", "0-2/name"],
        fleet_size: "fleet_size",
        role: "role"
      }
    },

    AB_TEST_ENABLED: false,
    VARIANTS: {
      a: {
        headline: 'Catch freight fraud before it hits your <span class="accent">P&amp;L</span>.',
        subhead: "Nomad puts fraud review, every carrier you work with, and your fuel and factoring data in one place—so finance, operations and risk act on the same numbers, the same day."
      },
      b: {
        headline: 'One view of every carrier, load and <span class="accent">dollar</span>.',
        subhead: "Review and flag fraud, compare carriers side by side, and connect fuel and factoring data—so your team stops losses before payment, not after month-end."
      }
    }
  };

  var $html = $(document.documentElement).addClass("js");
  var $body;

  function store(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) {  }
  }
  function recall(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  window.dataLayer = window.dataLayer || [];
  var state = { variant: "a", utm: {}, formStarted: {} };

  function track(event, props) {
    window.dataLayer.push($.extend({ event: event, variant: state.variant }, props || {}));
  }

  function initVariant() {
    var params = new URLSearchParams(window.location.search);
    var forced = (params.get("v") || "").toLowerCase();
    var saved = recall("nomad_variant");
    var v;

    if (CONFIG.VARIANTS[forced]) v = forced;
    else if (CONFIG.AB_TEST_ENABLED && CONFIG.VARIANTS[saved]) v = saved;
    else if (CONFIG.AB_TEST_ENABLED) v = Math.random() < 0.5 ? "a" : "b";
    else v = "a";

    if (CONFIG.AB_TEST_ENABLED || forced) store("nomad_variant", v);
    state.variant = v;
    $html.attr("data-variant", v);

    if (v !== "a") {
      $('[data-variant-text="headline"]').html(CONFIG.VARIANTS[v].headline);
      $('[data-variant-text="subhead"]').text(CONFIG.VARIANTS[v].subhead);
    }

    $.each(["utm_source", "utm_medium", "utm_campaign"], function (_, key) {
      var val = params.get(key);
      if (val) state.utm[key] = val.slice(0, 120);
    });
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var REQUIRED = "input[required], select[required]";

  var MESSAGES = {
    name: "Please enter your name.",
    email: "Please enter a valid work email, like name@company.com.",
    company: "Please enter your company name.",
    fleet_size: "Please choose your fleet size.",
    role: "Please choose your role."
  };

  function errorFor($input) {
    var $field = $input.closest(".field");
    return ($field.length ? $field : $input.closest("form")).find(".field-error").first();
  }

  function setError($input, message) {
    var $err = errorFor($input);
    if (message) {
      $input.add(proxyOf($input)).attr("aria-invalid", "true");
      $err.text(message).prop("hidden", false);
      if ($err.attr("id")) $input.add(proxyOf($input)).attr("aria-describedby", $err.attr("id"));
    } else {
      $input.add(proxyOf($input)).removeAttr("aria-invalid");
      $err.text("").prop("hidden", true);
    }
  }

  function proxyOf($input) {
    return $input.hasClass("select-native") ? $input.siblings(".select-btn") : $();
  }

  function focusField($input) {
    var $proxy = proxyOf($input);
    ($proxy.length ? $proxy : $input).trigger("focus");
  }

  function validateInput($input) {
    var value = $.trim($input.val() || "");
    var name = $input.attr("name");
    var message = "";
    if ($input.prop("required") && !value) message = MESSAGES[name] || "This field is required.";
    else if ($input.attr("type") === "email" && value && !EMAIL_RE.test(value)) message = MESSAGES.email;
    setError($input, message);
    return !message;
  }

  function validateForm($form) {
    var $firstBad = $();
    $form.find(REQUIRED).each(function () {
      var $input = $(this);
      if (!validateInput($input) && !$firstBad.length) $firstBad = $input;
    });
    if ($firstBad.length) focusField($firstBad);
    return !$firstBad.length;
  }

  function fillHidden($form, ctaLocation) {
    var values = {
      variant: state.variant,
      cta_location: ctaLocation,
      utm_source: state.utm.utm_source,
      utm_medium: state.utm.utm_medium,
      utm_campaign: state.utm.utm_campaign
    };
    $.each(values, function (name, val) {
      $form.find('input[name="' + name + '"]').val(val || "");
    });
  }

  function serialize($form) {
    var data = {};
    $.each($form.serializeArray(), function (_, field) { data[field.name] = $.trim(field.value); });
    data.page_url = window.location.href.split("#")[0];
    data.submitted_at = new Date().toISOString();
    return data;
  }

  function hubspotEnabled() {
    return !!(CONFIG.HUBSPOT.PORTAL_ID && CONFIG.HUBSPOT.FORM_GUID);
  }

  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function toHubspotPayload(data) {
    var parts = (data.name || "").split(/\s+/);
    var values = $.extend({}, data, {
      firstname: parts.shift() || "",
      lastname: parts.join(" ")
    });

    var fields = [];
    $.each(CONFIG.HUBSPOT.FIELD_MAP, function (key, properties) {
      if (!values[key]) return;
      $.each($.isArray(properties) ? properties : [properties], function (_, property) {
        var parts = property.split("/");
        var objectTypeId = parts.length > 1 ? parts[0] : "0-1";
        var name = parts.length > 1 ? parts[1] : parts[0];
        fields.push({ objectTypeId: objectTypeId, name: name, value: values[key] });
      });
    });

    var context = {
      pageUri: window.location.href.split("#")[0],
      pageName: document.title
    };

    var hutk = readCookie("hubspotutk");
    if (hutk) context.hutk = hutk;

    return { submittedAt: String(Date.now()), fields: fields, context: context };
  }

  function sendLead(data) {
    if (!hubspotEnabled()) {
      if (window.console) window.console.info("Demo mode: HubSpot PORTAL_ID / FORM_GUID are empty, so nothing was sent.");
      var d = $.Deferred();
      setTimeout(d.resolve, 700);
      return d.promise();
    }
    var url = hubspotUrl();
    var payload = toHubspotPayload(data);

    return $.ajax({
      url: url,
      method: "POST",
      contentType: "application/json",
      dataType: "json",
      data: JSON.stringify(payload),
      timeout: 15000
    }).done(function () {
      if (window.console) window.console.info("HubSpot: submission accepted.", url);
    }).fail(function (xhr, textStatus) {
      logHubspotError(url, payload, xhr, textStatus);
    });
  }

  function hubspotUrl() {
    var region = $.trim(CONFIG.HUBSPOT.REGION || "na1").toLowerCase();
    var host = region === "na1" ? "api.hsforms.com" : "api-" + region + ".hsforms.com";
    return "https://" + host + "/submissions/v3/integration/submit/" +
      encodeURIComponent($.trim(CONFIG.HUBSPOT.PORTAL_ID)) + "/" +
      encodeURIComponent($.trim(CONFIG.HUBSPOT.FORM_GUID));
  }

  function logHubspotError(url, payload, xhr, textStatus) {
    if (!window.console) return;
    var body = xhr.responseJSON || xhr.responseText || "(no response body)";
    var hint;
    if (xhr.status === 0) {
      hint = "The request was blocked before reaching HubSpot (CORS, network, ad blocker or wrong REGION). " +
        "Check CONFIG.HUBSPOT.REGION matches data-region in the form's embed code.";
    } else if (xhr.status === 404) {
      hint = "HubSpot can't find this form. Check PORTAL_ID, FORM_GUID and REGION.";
    } else if (xhr.status === 400) {
      hint = "HubSpot rejected the data. Usually a field the page sends isn't on the HubSpot form; see errors below.";
    } else if (xhr.status === 403) {
      hint = "HubSpot refused the submission for this account or form.";
    } else {
      hint = "Unexpected response (" + textStatus + ").";
    }
    window.console.group("HubSpot submission failed: HTTP " + xhr.status);
    window.console.warn(hint);
    window.console.log("Endpoint:", url);
    window.console.log("Response:", body);

    if (body && $.isArray(body.errors)) {
      $.each(body.errors, function (i, err) {
        window.console.warn("HubSpot error " + (i + 1) + ": " + (err.errorType || "") + " | " + (err.message || JSON.stringify(err)));
      });
    }
    window.console.log("Fields sent:", $.map(payload.fields, function (f) { return f.objectTypeId + "/" + f.name; }).join(", "));
    window.console.groupEnd();
  }

  function showSuccess($form, data) {
    var firstName = (data.name || "").split(/\s+/)[0];

    var $wrap = $('<div class="form-success" tabindex="-1" role="status"></div>').append(
      '<div class="success-icon" aria-hidden="true"><i class="fa-solid fa-check"></i></div>',
      $("<h3>").text("You're booked in" + (firstName ? ", " + firstName : "") + "."),
      $("<p>").append(
        "A Nomad product specialist will email ",
        $("<b>").text(data.email || "you"),
        " within 1 business day to pick a time that works."
      )
    );
    $form.replaceWith($wrap);
    $wrap.trigger("focus");
  }

  var selectSeq = 0;
  var CHEVRON = '<i class="fa-solid fa-chevron-down select-chevron" aria-hidden="true"></i>';
  var CHECK = '<i class="fa-solid fa-check select-check" aria-hidden="true"></i>';

  function closeAllSelects(except) {
    $(".select.is-open").each(function () {
      if (this !== except) $(this).data("closeSelect")();
    });
  }

  function enhanceSelect(select) {
    var $select = $(select);
    if ($select.hasClass("select-native")) return;

    var id = select.id || "sel-" + (++selectSeq);
    var labelId = id + "-label";
    var $label = $select.closest(".field").find('label[for="' + select.id + '"]').attr("id", labelId);

    $select.addClass("select-native").attr({ "aria-hidden": "true", tabindex: "-1" })
      .wrap('<div class="select"></div>');
    var $wrap = $select.parent();

    var $value = $('<span class="select-value"></span>');
    var $btn = $('<button type="button" class="select-btn" role="combobox" aria-haspopup="listbox" aria-expanded="false"></button>')
      .attr({ id: id + "-btn", "aria-controls": id + "-list", "aria-labelledby": labelId })
      .append($value, CHEVRON);
    var $list = $('<ul class="select-list" role="listbox"></ul>')
      .attr({ id: id + "-list", "aria-labelledby": labelId });

    var placeholder = $select.find('option[value=""]').first().text() || "Select";
    $select.find("option").each(function (i) {
      if (this.disabled || this.value === "") return;
      $('<li class="select-option" role="option" aria-selected="false"></li>')
        .attr({ id: id + "-opt-" + i, "data-value": this.value })
        .append($("<span>").text(this.text), CHECK)
        .appendTo($list);
    });
    $wrap.append($btn, $list);

    var $items = $list.children();
    var active = -1;
    var typed = "";
    var typedTimer;

    function isOpen() { return $btn.attr("aria-expanded") === "true"; }

    function sync() {
      var val = $select.val();
      var $chosen = $items.filter(function () { return $(this).attr("data-value") === val; });
      $items.attr("aria-selected", "false");
      $chosen.attr("aria-selected", "true");
      $value.text($chosen.length ? $chosen.text() : placeholder);
      $btn.toggleClass("is-placeholder", !$chosen.length);
    }

    function setActive(i) {
      if (!$items.length) return;
      active = Math.max(0, Math.min($items.length - 1, i));
      $items.removeClass("is-active");
      var el = $items.eq(active).addClass("is-active")[0];
      $btn.attr("aria-activedescendant", el.id);
      var list = $list[0];
      if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
      else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
      }
    }

    function open() {
      if (isOpen()) return;
      closeAllSelects($wrap[0]);
      var rect = $btn[0].getBoundingClientRect();
      var $clip = $wrap.closest(".modal-panel");
      var bounds = $clip.length ? $clip[0].getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      var needed = Math.min($list[0].scrollHeight, 288) + 12;
      var below = bounds.bottom - rect.bottom;
      var above = rect.top - bounds.top;
      $wrap.toggleClass("open-up", below < needed && above > below);
      $wrap.addClass("is-open");
      $btn.attr("aria-expanded", "true");
      var selected = $items.index($items.filter('[aria-selected="true"]'));
      setActive(selected >= 0 ? selected : 0);
    }

    function close() {
      if (!isOpen()) return;
      $wrap.removeClass("is-open open-up");
      $btn.attr("aria-expanded", "false").removeAttr("aria-activedescendant");
      $items.removeClass("is-active");
    }

    function choose(i) {
      var val = $items.eq(i).attr("data-value");
      if ($select.val() !== val) $select.val(val).trigger("change");
      else sync();
      close();
      $btn.trigger("focus");
    }

    function typeahead(ch) {
      clearTimeout(typedTimer);
      typed += ch.toLowerCase();
      typedTimer = setTimeout(function () { typed = ""; }, 600);
      var start = typed.length === 1 ? active + 1 : active;
      for (var n = 0; n < $items.length; n++) {
        var i = (start + n) % $items.length;
        if ($items.eq(i).text().toLowerCase().indexOf(typed) === 0) { setActive(i); return; }
      }
    }

    $wrap.data("closeSelect", close);
    $select.on("change", sync);
    $label.on("click", function (e) { e.preventDefault(); $btn.trigger("focus"); });

    $btn.on("click", function () { isOpen() ? close() : open(); });

    $btn.on("keydown", function (e) {
      var k = e.key;
      if (!isOpen()) {
        if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
          e.preventDefault();
          open();
        } else if (k.length === 1 && /\S/.test(k)) {
          open();
          typeahead(k);
        }
        return;
      }
      switch (k) {
        case "ArrowDown": e.preventDefault(); setActive(active + 1); break;
        case "ArrowUp": e.preventDefault(); setActive(active - 1); break;
        case "Home": case "PageUp": e.preventDefault(); setActive(0); break;
        case "End": case "PageDown": e.preventDefault(); setActive($items.length - 1); break;
        case "Enter": case " ": e.preventDefault(); choose(active); break;
        case "Escape": e.preventDefault(); e.stopPropagation(); close(); break;
        case "Tab": choose(active); break;
        default: if (k.length === 1) typeahead(k);
      }
    });

    $btn.on("blur", function () {
      setTimeout(function () {
        if (!$wrap[0].contains(document.activeElement)) close();
      }, 0);
    });

    $list
      .on("mousedown", function (e) { e.preventDefault(); })
      .on("mousemove", ".select-option", function () {
        var i = $items.index(this);
        if (i !== active) {
          $items.removeClass("is-active");
          active = i;
          $(this).addClass("is-active");
          $btn.attr("aria-activedescendant", this.id);
        }
      })
      .on("click", ".select-option", function () { choose($items.index(this)); });

    sync();
  }

  $(document).on("mousedown touchstart", function (e) {
    if (!$(e.target).closest(".select").length) closeAllSelects();
  });

  function bindDemoForm($form) {
    $form.find("select").each(function () { enhanceSelect(this); });
    var ctaOf = function () { return $form.attr("data-cta") || "unknown"; };
    var $submit = $form.find('button[type="submit"]');
    var $formError = $form.find(".form-error");

    $form
      .on("focusin", function () {
        var cta = ctaOf();
        if (state.formStarted[cta]) return;
        state.formStarted[cta] = true;
        track("demo_form_start", { cta_location: cta });
      })
      .on("focusout", REQUIRED, function () {
        if ($(this).val()) validateInput($(this));
      })
      .on("input", "[aria-invalid='true']", function () {
        validateInput($(this));
      })
      .on("change", "select", function () {
        validateInput($(this));
      })
      .on("submit", function (e) {
        e.preventDefault();
        var cta = ctaOf();
        $formError.prop("hidden", true);

        if (!validateForm($form)) {
          track("demo_form_error", { cta_location: cta });
          return;
        }

        fillHidden($form, cta);
        var data = serialize($form);

        if (data.nx_check) {
          if (window.console) window.console.warn("Spam check field was filled, so this submission was not sent.");
          showSuccess($form, data);
          return;
        }
        delete data.nx_check;

        if (window.console) window.console.info("Sending demo request (" + cta + ")\u2026");

        var originalLabel = $submit.text();
        $submit.prop("disabled", true).text("Booking…");

        sendLead(data)
          .done(function () {
            track("demo_request_submitted", {
              cta_location: cta,
              fleet_size: data.fleet_size,
              role: data.role
            });
            showSuccess($form, data);
          })
          .fail(function () {
            $submit.prop("disabled", false).text(originalLabel);
            $formError
              .text("Something went wrong sending your request. Please try again, or email demo@nomad.example.")
              .prop("hidden", false);
            track("demo_form_failure", { cta_location: cta });
          });
      });
  }

  var $modal, $modalSlot, $formTemplate = $(), lastFocus = null;

  function buildModalForm() {
    if (!$formTemplate.length || !$modalSlot.length) return $();

    var $clone = $formTemplate.clone(false).attr({ id: "modal-demo-form", "data-cta": "modal" });
    $clone.find("[id]").each(function () { this.id = "m-" + this.id; });
    $clone.find("label[for]").attr("for", function (_, val) { return "m-" + val; });

    $clone.find(".field").each(function (i) {
      $(this).find(".field-error").attr("id", "m-err-" + i);
    });

    $modalSlot.empty().append($clone);
    bindDemoForm($clone);
    return $clone;
  }

  function focusables() {
    return $modal
      .find('a[href], button:not([disabled]), input:not([type="hidden"]):not([tabindex="-1"]), select:not([tabindex="-1"]), textarea, [tabindex]:not([tabindex="-1"])')
      .filter(":visible");
  }

  function openModal(trigger, opts) {
    if (!$modal.length) return;
    opts = opts || {};
    lastFocus = trigger || document.activeElement;

    var $form = $modalSlot.find("form");
    if (!$form.length) $form = buildModalForm();
    if (!$form.length) return;
    $form.attr("data-cta", opts.cta || "modal");

    if (opts.email) {
      var $email = $form.find('input[name="email"]').val(opts.email);
      setError($email, "");
    }

    $modal.prop("hidden", false);
    $body.addClass("modal-open");

    var $target = $form.find(REQUIRED).filter(function () { return !$(this).val(); }).first();
    if (!$target.length) $target = $form.find("input").first();
    window.requestAnimationFrame(function () { focusField($target); });

    track("demo_modal_open", { cta_location: opts.cta || "modal" });
  }

  function closeModal() {
    if (!$modal.length || $modal.prop("hidden")) return;
    closeAllSelects();
    $modal.prop("hidden", true);
    $body.removeClass("modal-open");

    if (!$modalSlot.find("form").length) $modalSlot.empty();
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function initModal() {
    $modal = $("#demo-modal");
    $modalSlot = $modal.find(".modal-form-slot");
    if (!$modal.length) return;

    $(document)
      .on("click", "[data-open-demo]", function (e) {
        e.preventDefault();
        var cta = $(this).attr("data-cta") || "button";
        track("cta_click", { cta_location: cta });
        openModal(this, { cta: cta });
      })
      .on("click", "[data-close-modal]", closeModal)
      .on("keydown", function (e) {
        if ($modal.prop("hidden")) return;
        if (e.key === "Escape") { e.preventDefault(); closeModal(); return; }
        if (e.key === "Tab") {
          var $items = focusables();
          if (!$items.length) return;
          var first = $items[0];
          var last = $items[$items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });
  }

  function initHeroForm() {
    var $form = $("#hero-form");
    if (!$form.length) return;
    var $input = $form.find('input[name="email"]');
    $input.attr("aria-describedby", $form.find(".field-error").attr("id"));

    $form
      .on("focusin", function () {
        if (state.formStarted.hero) return;
        state.formStarted.hero = true;
        track("demo_form_start", { cta_location: "hero" });
      })
      .on("submit", function (e) {
        e.preventDefault();
        if (!validateInput($input)) { $input.trigger("focus"); return; }
        track("cta_click", { cta_location: "hero", step: 1 });
        openModal($form.find("button")[0], { cta: "hero", email: $.trim($input.val()) });
      });

    $input.on("input", function () {
      if ($input.attr("aria-invalid") === "true") validateInput($input);
    });
  }

  function initStickyCta() {
    var $bar = $("#sticky-cta");
    var $hero = $(".hero");
    var $final = $("#demo");
    if (!$bar.length || !$hero.length || !$final.length || !("IntersectionObserver" in window)) return;
    var $btn = $bar.find("button");
    var heroVisible = true;
    var finalVisible = false;

    function update() {
      var show = !heroVisible && !finalVisible;
      $bar.toggleClass("is-visible", show).attr("aria-hidden", show ? "false" : "true");
      $btn.attr("tabindex", show ? 0 : -1);
    }

    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      update();
    }, { threshold: 0, rootMargin: "-64px 0px 0px 0px" }).observe($hero[0]);

    new IntersectionObserver(function (entries) {
      finalVisible = entries[0].isIntersecting;
      update();
    }, { threshold: 0.15 }).observe($final[0]);
  }

  function initReveal() {
    if (!("IntersectionObserver" in window)) return;

    var $items = $(".stat-grid, .feature, .step, .quote, .sec-grid li, .faq-list, .form-card").addClass("reveal");
    var revealObs = new IntersectionObserver(function (entries) {
      $.each(entries, function (_, entry) {
        if (entry.isIntersecting) {
          $(entry.target).addClass("is-in");
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    $items.each(function () { revealObs.observe(this); });

    var seen = {};
    var sectionObs = new IntersectionObserver(function (entries) {
      $.each(entries, function (_, entry) {
        var name = entry.target.id || $(entry.target).attr("aria-labelledby");
        if (entry.isIntersecting && !seen[name]) {
          seen[name] = true;
          track("section_view", { section: name });
        }
      });
    }, { threshold: 0.4 });
    $("main > section[id], main > section[aria-labelledby]").each(function () { sectionObs.observe(this); });
  }

  function initFaq() {
    $(".faq details").each(function () {
      var $d = $(this);
      $d.on("toggle", function () {
        if (this.open) track("faq_open", { question: $.trim($d.find("summary").text()) });
      });
    });
  }

  $(function () {
    $body = $(document.body);
    initVariant();
    $("#year").text(new Date().getFullYear());

    var $finalForm = $("#demo-form");
    if ($finalForm.length) {
      $finalForm.find(".field").each(function (i) {
        $(this).find(".field-error").attr("id", "df-err-" + i);
      });
      $formTemplate = $finalForm.clone(false);
      initModal();
      buildModalForm();
      bindDemoForm($finalForm);
    } else {
      initModal();
    }

    initHeroForm();
    initStickyCta();
    initReveal();
    initFaq();
    track("page_view_landing");
  });
})(jQuery, window, document);
