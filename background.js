/*
 * Tab Auto Sync
 * 
 * Author: Kyle Barnhart
 *
 * https://chrome.google.com/webstore/detail/tab-auto-sync/pglfmdocdcdahjhgcbpjmbglpeenmmef
*/

/* fires the function only at the end */
var resizeTimeout = null;
var requestFunction = function() {
	chrome.extension.sendRequest({'changes': true});
};
window.onresize = function() {
	if(resizeTimeout != null) {
		clearTimeout(resizeTimeout);
	}
	resizeTimeout = setTimeout(requestFunction, 500);
};

var otherBookmarksID;
var bookmarkID;
var running;
var jsonObject;
var listener;
var firstTabs;
var profile;

// Checks online status
var online = false;
var image = document.createElement("img");
image.onload = function() { online = true;};
image.onerror = function() { online = false;};

document.addEventListener('DOMContentLoaded', function () {
	main();
});

function getDelay() {
	var delay = 2000;
	
	if(localStorage["delay"]) {
		delay = parseInt(localStorage["delay"]);
	} else {
		localStorage["delay"] = delay;
	}
	
	return delay;
}

function checkOnline(callback) {
	var delay = getDelay();

	image.src = "http://www.google.com/images/logo.gif?" + Math.random() * 100000;
	setTimeout(callback, delay);
}

function main() {
	listener = {};
	running = true;
	jsonObject = {"windows":[]};
	firstTabs = new Array(2);
	
	if(localStorage["startRunning"]) {
		if(localStorage["startRunning"] === "last") {
			if(localStorage["lastRunning"]) {
				running = (localStorage["lastRunning"] === "true");
			} else {
				localStorage["lastRunning"] = "true";
			}
		} else {
			running = (localStorage["startRunning"] === "true");
		}
	} else {
		localStorage["startRunning"] = "true";
	}
	
	if(localStorage["profile"]) {
		profile = localStorage["profile"];
	} else {
		profile = "default";
		localStorage["profile"] = profile;
	}
	
	setupListener();

	chrome.browserAction.onClicked.addListener(function(tab) {
		if(running) {
			stop();
			
		} else {
			start();
		}
		
		running = !running;
	});
	
	if(running) {
		start();
	}
}

function setBrowserAction(title, icon) {
	if(!title) {
		title = "Unknown";
	}
	
	if(!icon) {
		icon = "icon19red.png";
	}
	
	chrome.browserAction.setIcon({'path': icon});
	chrome.browserAction.setTitle({'title': title});
}

function sendNotification(icon, title, message) {
	if(!title) {
		title = "Unknown";
	}
	
	if(!icon) {
		icon = "icon19red.png";
	}
	
	if(!message) {
		message = "No Message.";
	}
	
	var notification = webkitNotifications.createNotification(
	  icon,
	  title,
	  message
	);
	
	notification.show();
}

function start(notifications) {
	if(notifications == null) {
		notifications = true;
	}
	
	checkOnline(function() {
		if(running) {
			if(online) {
				setBrowserAction("Sync On", "icon19.png");
				
				if(notifications == false) {
					sendNotification('icon48.png',
					  'Online',
					  'Syncing tabs and windows.'
					);
				}
				
				sync();				
			} else {
				if(notifications) {					
					setBrowserAction("Offline", "icon19red.png");
					
					sendNotification('icon48red.png',
					  'Offline',
					  'Tabs and windows not synced.'
					);
				}
				
				setTimeout(function() { start(false); }, 10000);
			}			
		}
	});
}

function sync() {
	var delay = getDelay();
	var jsonText = JSON.stringify(jsonObject);
	
	setBrowserAction("Sync On", "icon19.png");
	localStorage["lastRunning"] = "true";
	
	chrome.tabs.create({'url': "chrome://sync"}, function (tab1) {
		
		// Inform user of syncing.
		chrome.tabs.create({'url': "syncing.html"}, function(tab2) {
			
			firstTabs[0] = tab1.id;
			firstTabs[1] = tab2.id;
			
			setTimeout(function() {
				chrome.bookmarks.getTree(function(tree){ 
					otherBookmarksID = tree[0].children[1].id; 
					
					var found = false;
					var title = "Tab Auto Sync Bookmark";
					
					if(profile.toLowerCase() != "default") {
						title += " (" + profile + ")";
					}
					
					tree[0].children[1].children.forEach(function(node) {
						if(node.title == title) {
							if(found) {
								chrome.bookmarks.remove(node.id);
							} else {
								bookmarkID = node.id;
								found = true;

								if(node.url.substring(0,4) == "json") {
									
									jsonObject = JSON.parse(node.url.substr(5));
									createWindow(0);
								} else {
									chrome.bookmarks.update(bookmarkID, {'url': "json:" + jsonText}, function() {
										removeFirstTabsAndStartEvents();
									});
								}
							}
						}
					});

					if(!found) {
						chrome.bookmarks.create({'parentId': otherBookmarksID,
												 'title': title,
												 'url': "json:" + jsonText},
												 function(node) {
													bookmarkID = node.id;
													removeFirstTabsAndStartEvents();
												 });	
					}
					
				});
			}, delay);
		});
	});
}

function stop() {
	setBrowserAction("Sync Off", "icon19grey.png");
	localStorage["lastRunning"] = "false";
	
	removeEvents();
}

function saveWindowsTabs(notifications) {
	if(notifications == null) {
		notifications = true;
	}

	checkOnline(function() {
		if(running) {
			if(online) {
				if(notifications == false) {
					addEvents();
					
					setBrowserAction("Sync On", "icon19.png");
					
					sendNotification('icon48.png',
					  'Online',
					  'Syncing tabs and windows.'
					);
					
					serializeAll();
				}
				
				var jsonCode = "json:" + JSON.stringify(jsonObject);
	
				chrome.bookmarks.update(bookmarkID, {'url': jsonCode});			
			} else {
				if(notifications) {
					removeEvents();
					
					setBrowserAction("Offline", "icon19red.png");
					
					sendNotification('icon48red.png',
					  'Offline',
					  'Tabs and windows not synced.'
					);
				}
				
				setTimeout(function() { saveWindowsTabs(false); }, 10000);
			}			
		}
	});
}

function serializeAll() {
	jsonObject = {"windows":[]};
	
	chrome.windows.getAll({'populate': true}, function(windows) {
		for(var i = 0; i < windows.length; i++) {
			serializeWindow(window[i]);
		}
	});
}

function serializeWindow(window) {
	var serialize = false;
	var jsonWinNum = 0;
	var jsonLength = jsonObject.windows.length;

	// Make sure window has tabs, is not a popup, and has something in it other then newtabs
	if(window.tabs.length > 0 && window.type == "normal") {
		window.tabs.forEach(function(t) {
			var url = t.url;
			if(url && url != "chrome://newtab/" && url != "chrome://newtab") {
				serialize = true;
			}
		});
	}

	// Find window in json
	var found = false;
	var i = 0;
	while(i < jsonLength && !found) {
		if(jsonObject.windows[i].id == window.id) {
			jsonWinNum = i;
			found = true;
		}
		i++;
	}

	if(serialize) {
		if(found) {
			jsonObject.windows[jsonWinNum] = window;
		} else {
			jsonObject.windows.push(window);
			jsonWinNum = jsonLength;
		}

		jsonObject.windows[jsonWinNum].top = jsonObject.windows[jsonWinNum].top / screen.height;
		jsonObject.windows[jsonWinNum].left = jsonObject.windows[jsonWinNum].left / screen.width;
		jsonObject.windows[jsonWinNum].width = jsonObject.windows[jsonWinNum].width / screen.width;
		jsonObject.windows[jsonWinNum].height = jsonObject.windows[jsonWinNum].height / screen.height;
	} else {

		// If found and not serialize, remove window from json
		if(found) {
		
			// for performance
			if(jsonWinNum == jsonLength - 1) {
				jsonObject.windows.pop();
			} else {
				jsonObject.windows.splice(jsonWinNum, 1);
			}
		}
	}
}

function createWindow(winNum) {
	if(winNum < jsonObject.windows.length) {
		
		// make sure it shows up on the screen and there are tabs
		if(jsonObject.windows[winNum].left < 1 && jsonObject.windows[winNum].top < 1 && jsonObject.windows[winNum].left + jsonObject.windows[winNum].width > 0 && jsonObject.windows[winNum].top + jsonObject.windows[winNum].height > 0 && jsonObject.windows[winNum].tabs.length > 0) {
			var url = "chrome://newtab/";
		
			url = jsonObject.windows[winNum].tabs[0].url;
			
			chrome.windows.create({'url' : url,
								   'left': Math.round(parseFloat(jsonObject.windows[winNum].left) * screen.width),
								   'top': Math.round(parseFloat(jsonObject.windows[winNum].top) * screen.height),
								   'width': Math.round(parseFloat(jsonObject.windows[winNum].width) * screen.width),
								   'height': Math.round(parseFloat(jsonObject.windows[winNum].height) * screen.height),
								   'type': jsonObject.windows[winNum].type},
									function(newWindow){
										
										// add tabs to window
										createTab(1, winNum, newWindow.id);
									});
		} else {
			createWindow(winNum + 1);
		}
	} else {
		removeFirstTabsAndStartEvents();
	}
}

function removeFirstTabsAndStartEvents() {
	chrome.windows.getAll({'populate': true}, function(windows) {

		var url = windows[0].tabs[0].url;

		if(windows.length == 1 || (url != "chrome://newtab/" && url != "chrome://newtab")) {
			removeFirstTabs(0);
		} else {
			chrome.tabs.remove(windows[0].tabs[0].id, function() {
				removeFirstTabs(0);
			});
		}
	});
}

function removeFirstTabs(tabNum) {
	if(tabNum < 2) {
		chrome.tabs.remove(firstTabs[tabNum], function() {
			removeFirstTabs(tabNum + 1);
		});
	} else {
		
		// If you stop while in sync the events will still serialize
		if(running) {
			serializeAll();
				
			addEvents();
		}
	}
}

function createTab(tabNum, winNum, windowId) {
	if(tabNum < jsonObject.windows[winNum].tabs.length) {
		chrome.tabs.create({'windowId': windowId,
							'url': jsonObject.windows[winNum].tabs[tabNum].url,
							'active': jsonObject.windows[winNum].tabs[tabNum].active === 'true',
							'pinned': jsonObject.windows[winNum].tabs[tabNum].pinned === 'true'},
							function() {
								
								createTab(tabNum + 1, winNum, windowId);
							});

	} else {
		createWindow(winNum + 1);
	}
}

function setupListener() {
	listener.activeChanged = function(tabId, selectInfo) {
		saveChangesByWindowId(selectInfo.windowId);
	};
	
	listener.attached = function(tabId, attachInfo) {
		saveChangesByWindowId(attachInfo.newWindowId);
	};

	listener.created = function(tab) {
		saveChangesByWindowId(tab.windowId);
	};
	
	listener.detached = function(tabId, detachInfo) {
		saveChangesByWindowId(detachInfo.oldWindowId);
	};
	
	listener.moved = function(tabId, moveInfo) {
		saveChangesByWindowId(moveInfo.windowId);
	};
	
	// This removes a window if the last tab is removed.  Otherwise, remove the tab normally.
	// This has to be fast, so I put all the stuff here.
	listener.removed = function(tabId, removeInfo) {
		for(var i = 0; i < jsonObject.windows.length; i++) {
			for(var j = 0; j < jsonObject.windows[i].tabs.length; j++) {
				if(jsonObject.windows[i].tabs[j].id == tabId) {
					if((!removeInfo.isWindowClosing && jsonObject.windows[i].tabs.length == 1) || jsonObject.windows[i].type != "normal") {
						
						// for performance
						if(i == jsonObject.windows.length - 1) {
							jsonObject.windows.pop();
						} else {
							jsonObject.windows.splice(i, 1);
						}

						chrome.bookmarks.update(bookmarkID, {'url': "json:" + JSON.stringify(jsonObject)});
					} else if(!removeInfo.isWindowClosing) {

						// for performance
						if(j == jsonObject.windows[i].tabs.length - 1) {
							jsonObject.windows[i].tabs.pop();
						} else {
							jsonObject.windows[i].tabs.splice(j, 1);
						}

						chrome.bookmarks.update(bookmarkID, {'url': "json:" + JSON.stringify(jsonObject)});
					}
				}
			}
		}
	};

	listener.updated = function(tabId, changeInfo, tab) {
		if(changeInfo.url) {
			saveChangesByWindowId(tab.windowId);
		}
	};

	listener.request = function(request, sender, sendResponse) {
		
		if(request.changes && request.changes == true) {
			chrome.windows.getCurrent(function(window) {
				saveChangesByWindowId(window.id);
			});
		}
		
		if(request.profile && request.profile == true) {
			stop();
			
			if(localStorage["profile"]) {
				profile = localStorage["profile"];
			} else {
				profile = "default";
				localStorage["profile"] = profile;
			}
			
			start();
		}
	};
}

function addEvents() {
	chrome.tabs.onActiveChanged.addListener(listener.activeChanged);
	
	chrome.tabs.onAttached.addListener(listener.attached);
	
	chrome.tabs.onCreated.addListener(listener.created);
	
	chrome.tabs.onDetached.addListener(listener.detached);
	
	chrome.tabs.onMoved.addListener(listener.moved);
	
	chrome.tabs.onRemoved.addListener(listener.removed);

	chrome.tabs.onUpdated.addListener(listener.updated);
	
	chrome.extension.onRequest.addListener(listener.request);
}

function removeEvents() {		
	chrome.tabs.onActiveChanged.removeListener(listener.activeChanged);
	
	chrome.tabs.onAttached.removeListener(listener.attached);
	
	chrome.tabs.onCreated.removeListener(listener.created);
	
	chrome.tabs.onDetached.removeListener(listener.detached);
	
	chrome.tabs.onMoved.removeListener(listener.moved);
	
	chrome.tabs.onRemoved.removeListener(listener.removed);

	chrome.tabs.onUpdated.removeListener(listener.updated);
	
	chrome.extension.onRequest.removeListener(listener.request);
}

function saveChangesByTabId(tabId) {
	chrome.tabs.get(tabId, function(tab) {
		saveChangesByWindowId(tab.windowId);
	});
}

function saveChangesByWindowId(windowId) {
	chrome.windows.getAll({'populate': true}, function(windows) {
		for(var i = 0; i < windows.length; i++) {
			if(windows[i].id == windowId) {
				serializeWindow(windows[i]);
				saveWindowsTabs();
				i = 999;
			}
		}
	});
}