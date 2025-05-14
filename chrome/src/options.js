"use strict";

function saveOptions() {
  var shape = document.getElementById("shape").value;
  var position = document.getElementById("position").value;
  var mirror = document.getElementById("mirror").checked;
  var trackTabs = document.getElementById("trackTabs").checked;
  var trackPresentation = document.getElementById("trackPresentation").checked;

  chrome.storage.sync.set(
    {
      shape: shape,
      position: position,
      mirror: mirror,
      trackTabs: trackTabs,
      trackPresentation: trackPresentation,
    },
    function () {
      // Update status to let user know options were saved.
      var status = document.getElementById("status");
      status.textContent = "Options saved.";
      setTimeout(function () {
        status.textContent = "";
      }, 750);
    }
  );
}

function restoreOptions() {
  // Use default value color = 'red' and likesColor = true.
  chrome.storage.sync.get(
    {
      shape: "oval",
      position: "leftBottom",
      mirror: true,
      trackTabs: true,
      trackPresentation: true,
    },
    function (items) {
      document.getElementById("shape").value = items.shape;
      document.getElementById("position").value = items.position;
      document.getElementById("mirror").checked = items.mirror;
      document.getElementById("trackTabs").checked = items.trackTabs;
      document.getElementById("trackPresentation").checked =
        items.trackPresentation;
    }
  );
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("save").addEventListener("click", saveOptions);
