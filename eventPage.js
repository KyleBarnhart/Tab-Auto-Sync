/*
 * Tab Auto Sync
 * 
 * Author: Kyle Barnhart
 *
 * https://chrome.google.com/webstore/detail/tab-auto-sync/pglfmdocdcdahjhgcbpjmbglpeenmmef
*/
 
//
// Show saved tabs when browser opens
///////////////////////////////////////////
chrome.runtime.onStartup.addListener( start );

//
// When updating Tab Auto Sync, migrate tabs and profiles from bookmark to storage
///////////////////////////////////////////
chrome.runtime.onInstalled.addListener( function( details ) {
	if( details.reason == "update" ) {
		// Migrate tabs and profiles to storage
		// todo
	}
});

//
// When the storage changes
///////////////////////////////////////////
function onSyncStorageChange() {
	chrome.storage.sync.get( "windows", function( syncWindows ) {
		chrome.storage.local.get( "windows", function( localWindows ) {
		
			syncWindows = syncWindows.windows;
			localWindows = localWindows.windows;
			
			if( Object.prototype.toString.call( syncWindows ) !== '[object Array]' ) {
				syncWindows = [];
			}
			
			if( Object.prototype.toString.call( localWindows ) !== '[object Array]' ) {
				localWindows = [];
			}
			
			removeTabEvents();
			
			//updateWindows( syncWindows, localWindows, function() {
				// Remove storage change event
				chrome.storage.onChanged.removeListener( onSyncStorageChange );
	
				//chrome.storage.local.set( { "windows": localWindows }, function() {
					
					// Add storage change event
					chrome.storage.onChanged.addListener( onSyncStorageChange );
					
					// start events
					addTabEvents();
				//});
			//});
		});
	});
}

//
// Start Tab Auto Sync
// get synced data and open tabs
///////////////////////////////////////////
function start() {
	onSyncStorageChange();
}

//
// Create all missing windows and tabs
///////////////////////////////////////////
function updateWindows( syncWindows, localWindows, callback ) {
	var missingWindows = [];
	var removeWindows = [];

	// Create list of missing windows
	for( var i = 0; i < syncWindows.length; i++ ) {
		if( ! getWindowByGuid( localWindows, syncWindows[i].guid ) ) {
			missingWindows.push( syncWindows[i] );
		}
	}

	// Create list of windows to remove
	for( var i = 0; i < localWindows.length; i++) {
		if( ! getWindowByGuid( syncWindows, localWindows[i].guid ) ) {
			removeWindows.push( localWindows[i] );
		}
	}
	
	// Recursively create missing windows
	createWindow( localWindows, missingWindows, 0, function () {
		removeWindow( localWindows, removeWindows, 0, function () {
			updateTabs( syncWindows, localWindows, 0, callback );
		});
	});
}

//
// Return true if window is valid
///////////////////////////////////////////
function validateWindow( window ) {
	
	// Assert window exists
	if( ! window )
		return false;
	
	// Assert tabs exist
	if( ! window.tabs )
		return false;
	
	// Assert tabs is an array
	if( Object.prototype.toString.call( window.tabs ) !== '[object Array]' )
		return false;
	
	// Assert at least one tab
	if( window.tabs.length < 1 )
		return false;
	
	return true;
}

//
// Create a new window
///////////////////////////////////////////
function createWindow( localWindows, missingWindows, index, callback ) {

	// If all windows have been created, finish and callback
	if( missingWindows.length <= index &&
		callback &&
		typeof( callback ) === "function" )
	{
		callback();
		return;
	}
	
	var window = missingWindows[index];
	
	// Window properties
	var createData = {};
	
	// If the window is horizontally on screen, set the left and width
	if( window.left &&
		window.width &&
		window.left < 1 &&
		window.left + window.width > 0 )
	{
		createData.left = Math.round( window.left * screen.width );
		createData.width = Math.round( window.width * screen.width );
	}
	
	// If the window is vertically on screen, set the top and height
	if( window.top &&
		window.height &&
		window.top < 1 &&
		window.top + window.height > 0 )
	{
		createData.top = Math.round( window.top * screen.height );
		createData.height = Math.round( window.height * screen.height );
	}
	
	// Type property
	if( window.type )
		createData.type = window.type;
	
	// Create window
	chrome.windows.create( createData, function( currentWindow ) {

		// Add window to local storage
		localWindows.push( { "id": currentWindow.id, "guid": window.guid, "tabs": [] } );

		// Get window from local storage
		var lWin = getWindowById( localWindows, currentWindow.id );

		// Create missing tabs
		createTab( lWin.tabs, window.tabs, 0, function() {
			var tabId = -1;

			// Find leftmost tab (newtab)
			for( tab in currentWindow.tabs ) {
				if( tab.index === 0 ) {
					tabId = tab.tabId;
					break;
				}
			}
			
			// Remove leftmost tab (newtab)
			chrome.tabs.remove( tab.tabId, function() {
			
				// Create next window
				createWindow( localWindows, missingWindows, index + 1, callback );
			});
		});
	});
}

//
// Remove extra windows
/////////////////////////////////////////////
function removeWindow( localWindows, removeWindows, index, callback ) {
	// If all windows have been removed, finish and callback
	if( removeWindows.length <= index &&
		callback &&
		typeof( callback ) === "function" )
	{
		callback();
		return;
	}
	
	chrome.windows.remove( removeWindows[index].id, function () {
		
		// Remove window from local storage
		for( var i = 0; i < localWindows.length; i++ ) {
			if( localWindows[i].guid === removeWindows[index].guid ) {
				localWindows.splice(i, 1);
				break;
			}
		}
		
		removeWindow( localWindows, removeWindows, index + 1, callback );
	});
}

//
// Create all the tabs for the window
///////////////////////////////////////////
function updateTabs( syncWindows, localWindows, index, callback ) {

	// If all windows have been checked, finish and callback
	if( syncWindows.length <= index &&
		callback &&
		typeof( callback ) === "function" )
	{
		callback();
		return;
	}
	
	var missingTabs = [];
	var removeTabs = [];
	
	var syncTabs = syncWindows[index].tabs;
	var localTabs = getWindowByGuid( localWindows, syncWindows[index].guid );

	// Create list of missing windows
	for( var i = 0; i < syncTabs.length; i++ ) {
		if( ! getWindowByGuid( localTabs, syncTabs[i].guid ) ) {
			missingTabs.push( syncTabs[i] );
		}
	}

	// Create list of windows to remove
	for( var i = 0; i < localTabs.length; i++) {
		if( ! getWindowByGuid( syncTabs, localTabs[i].guid ) ) {
			removeTabs.push( localTabs[i] );
		}
	}

	// Recursively create missing windows
	createTab( localTabs, missingTabs, 0, function () {
		removeTab( localTabs, removeTabs, 0, function () {
			
			// Check tabs on next window
			updateTabs( syncWindows, localWindows, index + 1, callback );
		});
	});
}

//
// Create single tab
///////////////////////////////////////////
function createTab( localTabs, missingTabs, index, callback ) {
	
	// If all tabs have been created, finish and callback
	if( missingTabs.length <= index &&
		callback &&
		typeof( callback ) === "function" )
	{
		callback();
		return;
	}

	var tab = missingTabs[index];
	
	var createProperties = {};
		
	// Window ID
	createProperties.windowId = tab.windowId;
	
	// Index horizontal position on top bar
	// plus one to account for first tab (newtab)
	if( tab.index )
		createProperties.index = tab.index + 1;
	
	// URL
	createProperties.url = tab.url;
	
	// Active
	createProperties.active = false;
	if( tab.active )
		createProperties.active = tab.active;
	
	// Pinned tab
	if( tab.pinned )
		createProperties.pinned = tab.pinned;
	alert(JSON.stringify(tab));
	// Create tab
	chrome.tabs.create( createProperties, function( newTab ) {
		localTabs.push( { "id": newTab.id, "guid": tab.guid } );
		
		// Create next tab
		createTab( localTabs, missingTabs, index + 1, callback );
	});
}

//
// Remove extra windows
/////////////////////////////////////////////
function removeTab( localTabs, removeTabs, index, callback ) {
	// If all windows have been removed, finish and callback
	if( removeTabs.length <= index &&
		callback &&
		typeof( callback ) === "function" )
	{
		callback();
		return;
	}
	
	chrome.tabs.remove( removeTabs[index].id, function () {
		
		// Remove window from local storage
		for( var i = 0; i < localTabs.length; i++ ) {
			if( localTabs[i].guid === removeTabs[index].guid ) {
				localTabs.splice(i, 1);
				break;
			}
		}
		
		removeWindow( localTabs, removeTabs, index + 1, callback );
	});
}

//
// Save storage change
//////////////////////////////////////
function saveChangesToStorage( changeFunction ) {
	// Remove storage change event
	chrome.storage.onChanged.removeListener( onSyncStorageChange );
	
	// Get all windows
	chrome.storage.sync.get( "windows", function( syncWindows ) {
		chrome.storage.local.get( "windows", function( localWindows ) {
		
			syncWindows = syncWindows.windows;
			localWindows = localWindows.windows;
		
			if( Object.prototype.toString.call( syncWindows ) !== '[object Array]' ) {
				syncWindows = [];
			}
			
			if( Object.prototype.toString.call( localWindows ) !== '[object Array]' ) {
				localWindows = [];
			}
		
			if( changeFunction && typeof( changeFunction ) === "function" ) {
				changeFunction( syncWindows, localWindows, function() {
					// Save windows
					chrome.storage.sync.set( { "windows": syncWindows }, function() {
						chrome.storage.local.set( { "windows": localWindows }, function() {
	
							// Add storage change event
							chrome.storage.onChanged.addListener( onSyncStorageChange );
						});
					});
				});
			}
		});
	});
}

//
// Tab Events
//////////////////////////////////////
function tabCreatedEvent( tab ) {
	saveChangesToStorage(function ( syncWindows, localWindows, callback ) {
	
		// If window doesn't exist, create it
		checkWindowExists( syncWindows, localWindows, tab.windowId, function() {
		
			// Get local and sync storage windows
			var lWin = getWindowById( localWindows, tab.windowId );
			var sWin = getWindowByGuid( syncWindows, lWin.guid );
			
			// Create tab in storage
			tab.guid = GetGuid();
			
			lWin.tabs.push( { "id": tab.id, "guid": tab.guid } );
			sWin.tabs.push( tab );
			
			if( callback && typeof( callback ) === "function" )
				callback();
		});
	});
}
function tabUpdatedEvent( tabId, changeInfo, tab ) {
	saveChangesToStorage(function ( syncWindows, localWindows, callback ) {
		
		// If window doesn't exist, create it
		checkWindowExists( syncWindows, localWindows, tab.windowId, function() {

			// Get local and sync storage windows
			var lWin = findWindowByTabId( localWindows, tabId );
			var sWin = getWindowByGuid( syncWindows, lWin.guid );

			// Get local and sync storage tabs
			var lTab = getTabById( lWin.tabs, tabId );
			var sTab = getTabByGuid( sWin.tabs, lTab.guid );

			// Update tab in storage
			sTab.pinned = tab.pinned;
			sTab.url = tab.url;
			
			if( callback && typeof( callback ) === "function" )
				callback();
		});
	});
}
function tabMovedEvent( tabId, moveInfo) {
	saveChangesToStorage(function ( syncWindows, localWindows, callback ) {
	
		// If window doesn't exist, create it
		checkWindowExists( syncWindows, localWindows, moveInfo.windowId, function() {
		
			// Get local and sync storage windows
			var lWin = getWindowById( localWindows, moveInfo.windowId );
			var sWin = getWindowByGuid( syncWindows, lWin.guid );
			
			// Get window
			chrome.windows.get(moveInfo.windowId, function ( window ) {
			
				// Reset all index numbers in storage
				for( var i = 0; i < window.tabs.length; i++) {
					var lTab = getTabById( lWin.tabs, window.tabs[i].id );
					var sTab = getTabByGuid( sWin.tabs, lTab.guid );
					
					sTab.index = window.tabs[i].index;
				}
				
				if( callback && typeof( callback ) === "function" )
					callback();
			});
		});
	});
}
function tabDetachedEvent( tabId, detachInfo) {
	saveChangesToStorage(function ( syncWindows, localWindows, callback ) {	
		var lWin = getWindowById( localWindows, detachInfo.oldWindowId );
		
		// If the window is closing, then remove window
		if( lWin.tabs.length == 1 ) {
			
			// Remove window from local storage
			for( var i = 0; i < localWindows.length; i++ ) {
				if( localWindows[i].id === lWin.id ) {
					localWindows.splice(i, 1);
					break;
				}
			}
			
			// Remove window from sync storage
			for( var i = 0; i < syncWindows.length; i++ ) {
				if( syncWindows[i].guid === lWin.guid ) {
					syncWindows.splice(i, 1);
					break;
				}
			}
			
		// If it is just a tab, remove tab
		} else {
			var sWin = getWindowByGuid( syncWindows, lWin.guid );
			var lTab = getTabById( lWin.tabs, tabId );
			
			// Remove tab from local storage
			for( var i = 0; i < lWin.tabs.length; i++ ) {
				if( lWin.tabs[i].id === tabId ) {
					lWin.tabs.splice(i, 1);
					break;
				}
			}
			
			// Remove tab from sync storage
			for( var i = 0; i < sWin.tabs.length; i++ ) {
				if( sWin.tabs[i].guid === lWin.guid ) {
					sWin.tabs.splice(i, 1);
					break;
				}
			}
		}
		
		if( callback && typeof( callback ) === "function" )
			callback();
	});
}
function tabAttachedEvent( tabId, attachInfo) {
	chrome.tabs.get( tabId, function( tab ) {
		saveChangesToStorage(function ( syncWindows, localWindows, callback ) {
		
			// If window doesn't exist, create it
			checkWindowExists( syncWindows, localWindows, attachInfo.newWindowId, function() {

				// Get local and sync storage windows
				var lWin = getWindowById( localWindows, attachInfo.newWindowId );
				var sWin = getWindowByGuid( syncWindows, lWin.guid );
				
				// Create tab in storage
				tab.guid = GetGuid();
				
				lWin.tabs.push( { "id": tab.id, "guid": tab.guid } );
				sWin.tabs.push( tab );
				
				if( callback && typeof( callback ) === "function" )
					callback();
			});
		});
	});
}
function tabRemovedEvent( tabId, removeInfo ) {
	saveChangesToStorage(function ( syncWindows, localWindows, callback ) {
		var lWin = findWindowByTabId( localWindows, tabId );
		
		// If the window is closing, then remove window
		if( removeInfo.isWindowClosing ) {
		
			// Remove window from local storage
			for( var i = 0; i < localWindows.length; i++ ) {
				if( localWindows[i].id === lWin.id ) {
					localWindows.splice(i, 1);
					break;
				}
			}
			
			// Remove window from sync storage
			for( var i = 0; i < syncWindows.length; i++ ) {
				if( syncWindows[i].guid === lWin.guid ) {
					syncWindows.splice(i, 1);
					break;
				}
			}
		
		// If it is just a tab, remove tab
		} else {
			var sWin = getWindowByGuid( syncWindows, lWin.guid );
			var lTab = getTabById( lWin.tabs, tabId );
			
			// Remove tab from local storage
			for( var i = 0; i < lWin.tabs.length; i++ ) {
				if( lWin.tabs[i].id === tabId ) {
					lWin.tabs.splice(i, 1);
					break;
				}
			}
			
			// Remove tab from sync storage
			for( var i = 0; i < sWin.tabs.length; i++ ) {
				if( sWin.tabs[i].guid === lWin.guid ) {
					sWin.tabs.splice(i, 1);
					break;
				}
			}
		}
		
		if( callback && typeof( callback ) === "function" )
			callback();
	});
}

//
// Check if window exists, if it doesn't create it
///////////////////////////////////////
function checkWindowExists( syncWindows, localWindows, id, callback ) {
	var finish = function() {
		if( callback && typeof( callback ) === "function" )
			callback();
	};
	
	for( var i = 0; i < localWindows.length; i++) {
		if( localWindows[i].id === id ) {
			finish();
			return;
		}
	}
	
	// If window doesn't exist, create it
	chrome.windows.get(id, { "populate": true }, function ( window ) {
		window.guid = GetGuid();
		
		var localWindow = { "id": window.id, "guid": window.guid, "tabs": [] };
		
		// Make position relative
		window.top = window.top / screen.height;
		window.left = window.left / screen.width;
		window.width = window.width / screen.width;
		window.height = window.height / screen.height;
		
		// Add tab information
		for( var i = 0; i < window.tabs.length; i++ ) {
			window.tabs[i].guid = GetGuid();
			localWindow.tabs.push({ "id": window.tabs[i].id, "guid": window.tabs[i].guid });
		}
		
		localWindows.push( localWindow );
		syncWindows.push( window );
		
		finish();
	});
}

//
// Add functions to all tab events
/////////////////////////////////////////
function addTabEvents() {
	chrome.tabs.onCreated.addListener( tabCreatedEvent );
	chrome.tabs.onUpdated.addListener( tabUpdatedEvent );
	chrome.tabs.onMoved.addListener( tabMovedEvent );
	chrome.tabs.onDetached.addListener( tabDetachedEvent );
	chrome.tabs.onAttached.addListener( tabAttachedEvent );
	chrome.tabs.onRemoved.addListener( tabRemovedEvent );
	
	//chrome.extension.onRequest.addListener( listener.request );
}

//
// Remove functions to all tab events
/////////////////////////////////////////
function removeTabEvents() {
	chrome.tabs.onCreated.removeListener( tabCreatedEvent );
	chrome.tabs.onUpdated.removeListener( tabUpdatedEvent );
	chrome.tabs.onMoved.removeListener( tabMovedEvent );
	chrome.tabs.onDetached.removeListener( tabDetachedEvent );
	chrome.tabs.onAttached.removeListener( tabAttachedEvent );
	chrome.tabs.onRemoved.removeListener( tabRemovedEvent );
	
	//chrome.extension.onRequest.removeListener( listener.request );
}

//
// Tab and window helper functions
/////////////////////////////////////////
function getWindowByGuid( windows, guid ) {
	for( var i = 0; i < windows.length; i++) {
		if( windows[i].guid === guid ) {
			return windows[i];
		}
	}
}
function getWindowById( windows, id ) {
	for( var i = 0; i < windows.length; i++) {
		if( windows[i].id === id ) {
			return windows[i];
		}
	}
}
function getTabByGuid( tabs, guid ) {
	for( var i = 0; i < tabs.length; i++) {
		if( tabs[i].guid === guid ) {
			return tabs[i];
		}
	}
}
function getTabById( tabs, id ) {
	for( var i = 0; i < tabs.length; i++) {
		if( tabs[i].id === id ) {
			return tabs[i];
		}
	}
}
function findWindowByTabId( windows, id ) {
	
	for( var i = 0; i < windows.length; i++) {
		for( var j = 0; j < windows[i].tabs.length; j++) {
			if( windows[i].tabs[j].id === id ) {
				return windows[i];
			}
		}
	}
}

//
// Generate a Guid
//////////////////////////////////////
function GetGuid() {
	// http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
		return v.toString(16);
	});
}