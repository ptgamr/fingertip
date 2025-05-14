"use strict";

function WPRightMenu(element) {
  this.isMenuVisible = false;
  this.onMenuClick = null;
  this.initialize(element);
}

WPRightMenu.prototype.positionMenu = function (e) {
  var menu = this.menu;
  var clickX = e.clientX;
  var clickY = e.clientY;
  menu.style.left = clickX + "px";
  menu.style.top = clickY + "px";

  var menuWidth = menu.offsetWidth + 4;
  var menuHeight = menu.offsetHeight + 4;

  var windowWidth = window.innerWidth;
  var windowHeight = window.innerHeight;

  if (windowWidth - clickX < menuWidth) {
    menu.style.left = windowWidth - menuWidth + "px";
  }

  if (windowHeight - clickY < menuHeight) {
    menu.style.top = windowHeight - menuHeight + "px";
  }
};

WPRightMenu.prototype.initialize = function (element) {
  var _this = this;
  var menu = (this.menu = this.buildMenu());

  menu.addEventListener(
    "blur",
    function () {
      if (!_this.isMenuVisible) {
        return;
      }

      _this.isMenuVisible = false;
      element.removeChild(menu);
    },
    false
  );

  element.addEventListener(
    "contextmenu",
    function (e) {
      e.preventDefault();

      if (_this.isMenuVisible) {
        return;
      }

      // Update hand tracking status in menu before showing it
      _this.updateMenuStatus(element);

      element.appendChild(menu);
      _this.positionMenu(e);

      _this.isMenuVisible = true;

      menu.focus();
    },
    false
  );

  element.addEventListener(
    "click",
    function (e) {
      if (!_this.isMenuVisible) {
        return;
      }

      if (
        e &&
        e.target &&
        e.target.dataset &&
        e.target.dataset.value &&
        e.target.dataset.key
      ) {
        if (_this.onMenuClick) {
          var data = e.target.dataset;

          // Convert string to boolean for handTracking option
          var value = data.value;
          if (data.key === "handTracking") {
            value = value === "true";
          }

          _this.onMenuClick(data.key, value);

          // Update menu item text for handTracking
          if (data.key === "handTracking") {
            e.target.dataset.value = (!value).toString();
            e.target.textContent = value
              ? "Disable Hand Tracking"
              : "Enable Hand Tracking";
          }
        }
      }

      _this.isMenuVisible = false;
      element.removeChild(menu);
    },
    false
  );
};

WPRightMenu.prototype.updateMenuStatus = function (element) {
  // Update the hand tracking menu item status
  if (element.handTracking) {
    const isActive = element.handTracking.isTracking;
    const handTrackingMenuItem = this.menu.querySelector(
      '[data-key="handTracking"]'
    );
    if (handTrackingMenuItem) {
      handTrackingMenuItem.dataset.value = (!isActive).toString();
      handTrackingMenuItem.textContent = isActive
        ? "Disable Hand Tracking"
        : "Enable Hand Tracking";
    }
  }
};

WPRightMenu.prototype.hide = function () {
  this.menu.blur();
};

WPRightMenu.prototype.buildMenu = function () {
  var menuContainer = document.createElement("div");
  menuContainer.tabIndex = -1;
  menuContainer.className = "wp-right-menu";
  menuContainer.innerHTML =
    "<div>" +
    '  <div class="wp-menu-item" data-key="position" data-value="leftBottom">Left Bottom</div>' +
    '  <div class="wp-menu-item" data-key="position" data-value="rightBottom">Right Bottom</div>' +
    '  <div class="wp-menu-item" data-key="position" data-value="rightTop">Right Top</div>' +
    '  <div class="wp-menu-item" data-key="position" data-value="leftTop">Left Top</div>' +
    '  <div class="wp-menu-item-separator"></div>' +
    '  <div class="wp-menu-item" data-key="shape" data-value="oval">Oval</div>' +
    '  <div class="wp-menu-item" data-key="shape" data-value="rectangle">Rectangle</div>' +
    '  <div class="wp-menu-item" data-key="shape" data-value="square">Square</div>' +
    '  <div class="wp-menu-item" data-key="shape" data-value="circle">Circle</div>' +
    '  <div class="wp-menu-item-separator"></div>' +
    '  <div class="wp-menu-item" data-key="handTracking" data-value="true">Enable Hand Tracking</div>' +
    "</div>";

  return menuContainer;
};
