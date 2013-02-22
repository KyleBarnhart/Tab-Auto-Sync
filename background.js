/*
 * Tab Auto Sync
 * 
 * Author: Kyle Barnhart
 *
 * https://chrome.google.com/webstore/detail/tab-auto-sync/pglfmdocdcdahjhgcbpjmbglpeenmmef
*/

// This is so that when the last open tab is closed,
// it gets removed properly.
// Hopefully a way can be found to remove this so that
// Auto-Tab-Sync can be non-persistant
var syncCopy = [];
 
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
	
	start();
});

//
// When the storage changes
///////////////////////////////////////////
function onSyncStorageChange( callback ) {
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
			
			// Stop tab and windows events
			removeTabEvents();
			
			// Sync windows
			updateWindows( syncWindows, localWindows, function() {
			
				// Remove storage change event
				removeListenerWait(chrome.storage.onChanged, onSyncStorageChange, function() {
				
					// save local changes to storage
					chrome.storage.local.set( { "windows": localWindows }, function() {
						
						// Add storage change event
						chrome.storage.onChanged.addListener( onSyncStorageChange );
						
						// start events
						addTabEvents();
						
						if( callback && typeof( callback ) === "function" ) {
							callback();
						}
					});
				});
			});
		});
	});
}

//
// Setup local storage for auto-tab-sync
/////////////////////////////////////
function install( callback ) {
	
	// Create a computer guid if missing
	chrome.storage.local.get( "localId", function( items ) {
		if( ! items.localId ) {
			chrome.storage.local.set( { "localId": GetGuid() } );
		}
	});
	
	if( callback && typeof( callback ) === "function" ) {
		callback();
	}
}

//
// Start Tab Auto Sync
// get synced data and open tabs
///////////////////////////////////////////
function start() {
	chrome.storage.sync.remove( "windows" ); // for debugging

	// Clear local storage then get sync storage
	chrome.storage.local.remove( "windows", function() {
	
		// Add initial content to storage
		saveStartState(function () {
			chrome.windows.getAll({ "populate": true }, function ( windowInitial ) {
			
				// Get storage and sync
				onSyncStorageChange( function() {
					chrome.windows.getAll( { "populate": true }, function ( windowsAfter ) {
						// When starting, if the first tab on the first window is the new tab
						// and there is more than one window, close the first window
						if( windowInitial[0].tabs[0].url === "chrome://newtab/" &&
							( windowsAfter.length > 1 ||
							  windowsAfter[0].tabs.length > 1 )	)
						{
							// Remove first tab
							chrome.tabs.remove( windowInitial[0].tabs[0].id );
						}
					});
				});
			});
		});
	});
}

//
// Create all missing windows and tabs
///////////////////////////////////////////
function updateWindows( syncWindows, localWindows, callback ) {
	var missingWindows = [];
	var removeWindows = [];
	
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
		
		// Sort tabs by index number
		window.tabs.sort( function( a, b ) {
			return a.index - b.index;
		});
		
		// Create missing tabs
		createTab( lWin, window.tabs, 0, function() {
			var tabId = -1;

			// Find leftmost tab (newtab)
			for( var i = 0; i < currentWindow.tabs.length; i++ ) {
				if( currentWindow.tabs[i].index == 0 ) {
					tabId = currentWindow.tabs[i].id;
					break;
				}
			}
			
			// Remove leftmost tab (newtab)
			chrome.tabs.remove( tabId, function() {

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
	var localWindow = getWindowByGuid( localWindows, syncWindows[index].guid );
	
	// Sort tabs by index number
	syncTabs.sort( function( a, b ) {
		return a.index - b.index;
	});
	
	// Create list of missing tabs
	for( var i = 0; i < syncTabs.length; i++ ) {
		if( ! getWindowByGuid( localWindow.tabs, syncTabs[i].guid ) ) {
			missingTabs.push( syncTabs[i] );
		}
	}

	// Create list of tabs to remove
	for( var i = 0; i < localWindow.tabs.length; i++) {
		if( ! getWindowByGuid( syncTabs, localWindow.tabs[i].guid ) ) {
			removeTabs.push( localWindow.tabs[i] );
		}
	}
	
	// Recursively create missing windows
	createTab( localWindow, missingTabs, 0, function () {
		removeTab( localWindow, removeTabs, 0, function () {
			
			// Check tabs on next window
			updateTabs( syncWindows, localWindows, index + 1, callback );
		});
	});
}

//
// Create single tab
///////////////////////////////////////////
function createTab( localWindow, missingTabs, index, callback ) {
	
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
	createProperties.windowId = localWindow.id;
	
	// URL
	createProperties.url = tab.url;
	
	// Active
	createProperties.active = false;
	if( tab.active )
		createProperties.active = tab.active;
	
	// Pinned tab
	if( tab.pinned )
		createProperties.pinned = tab.pinned;

	// Create tab
	chrome.tabs.create( createProperties, function( newTab ) {
		localWindow.tabs.push( { "id": newTab.id, "guid": tab.guid } );
		
		// Create next tab
		createTab( localWindow, missingTabs, index + 1, callback );
	});
}

//
// Remove extra windows
/////////////////////////////////////////////
function removeTab( localWindow, removeTabs, index, callback ) {
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
		for( var i = 0; i < localWindow.tabs.length; i++ ) {
			if( localWindow.tabs[i].guid === removeTabs[index].guid ) {
				localWindow.tabs.splice(i, 1);
				break;
			}
		}
		
		removeWindow( localWindow, removeTabs, index + 1, callback );
	});
}

//
// Save storage change
//////////////////////////////////////
function saveChangesToStorage( changeFunction, callback ) {
	var finish = function() {
		// Setup fast remove if needed
		setupOnRemovedEvent();
		
		if( callback && typeof( callback ) === "function" ) {
			callback();
		}
	}
	
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

			// Call the change function, pass objects in by reference
			if( changeFunction && typeof( changeFunction ) === "function" ) {
				changeFunction( syncWindows, localWindows, function() {
				
					// Remove listener
					removeListenerWait( chrome.storage.onChanged, onSyncStorageChange, function() {
						
						// Save windows
						chrome.storage.local.set( { "windows": localWindows }, function() {
							chrome.storage.sync.set( { "windows": syncWindows }, function() {
								
								// Add storage change event
								chrome.storage.onChanged.addListener( onSyncStorageChange );
								
								finish();
							});
						});
					});
				});
			} else {
				finish();
			}
		});
	});
}

//
// Browser Start Function
// When browser opens, add content
//////////////////////////////////////
function saveStartState( callback ) {
	saveChangesToStorage(function ( syncWindows, localWindows, callback2 ) {
		
		// If window doesn't exist, create it
		chrome.windows.getAll({ "populate": true }, function ( windows ) {
			
			// For each window
			for( var i = 0; i < windows.length; i++ ) {
				var window = windows[i];

				window.guid = GetGuid();
				
				var localWindow = { "id": window.id, "guid": window.guid, "tabs": [] };
				
				// Make position relative
				window.top = window.top / screen.height;
				window.left = window.left / screen.width;
				window.width = window.width / screen.width;
				window.height = window.height / screen.height;
				
				// Add tab information
				for( var j = 0; j < window.tabs.length; j++ ) {
					window.tabs[j].guid = GetGuid();
					localWindow.tabs.push({ "id": window.tabs[j].id, "guid": window.tabs[j].guid });
				}
				
				localWindows.push( localWindow );
				syncWindows.push( window );
				
				if( callback2 && typeof( callback2 ) === "function" ) {
					callback2();
				}
			}
		});
	}, callback );
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
			
			if( callback && typeof( callback ) === "function" ) {
				callback();
			}
		});
	});
}
function tabUpdatedEvent( tabId, changeInfo, tab ) {
	// Only save tab after it finished loading.
	if( changeInfo.status !== "loading") {
		return;
	}
	
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
			
			if( callback && typeof( callback ) === "function" ) {
				callback();
			}
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
			chrome.windows.get(moveInfo.windowId, { "populate": true }, function ( window ) {

				// Reset all index numbers in storage
				for( var i = 0; i < window.tabs.length; i++) {
					var lTab = getTabById( lWin.tabs, window.tabs[i].id );
					var sTab = getTabByGuid( sWin.tabs, lTab.guid );

					sTab.index = window.tabs[i].index;
				}
				
				if( callback && typeof( callback ) === "function" ) {
					callback();
				}
			});
		});
	});
}
function tabDetachedEvent( tabId ) {
	saveChangesToStorage(function ( syncWindows, localWindows, callback ) {	
		var lWin = findWindowByTabId( localWindows, tabId );

		// If the window is closing, then remove window
		if( lWin.tabs.length === 1) {			
			var winGuid = -1;

			// Remove window from local storage
			for( var i = 0; i < localWindows.length; i++ ) {
				if( localWindows[i].id === lWin.id ) {
					winGuid = localWindows[i].guid;
					localWindows.splice(i, 1);
					break;
				}
			}

			// Remove window from sync storage
			for( var i = 0; i < syncWindows.length; i++ ) {
				if( syncWindows[i].guid === winGuid ) {
					syncWindows.splice(i, 1);
					break;
				}
			}

		// If it is just a tab, remove tab
		} else {
			var sWin = getWindowByGuid( syncWindows, lWin.guid );
			var tabGuid = -1;
			
			// Remove tab from local storage
			for( var i = 0; i < lWin.tabs.length; i++ ) {
				if( lWin.tabs[i].id === tabId ) {
					tabGuid = lWin.tabs[i].guid;
					lWin.tabs.splice(i, 1);
					break;
				}
			}

			// Remove tab from sync storage
			for( var i = 0; i < sWin.tabs.length; i++ ) {
				if( sWin.tabs[i].guid === tabGuid ) {
					sWin.tabs.splice(i, 1);
					break;
				}
			}
		}
		
		if( callback && typeof( callback ) === "function" ) {
			callback();
		}
	});
}
function tabAttachedEvent( tabId, attachInfo ) {
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
				
				// Make sure the index numbers are correct
				chrome.windows.get(lWin.id, { "populate": true }, function ( window ) {

					// Reset all index numbers in storage
					for( var i = 0; i < window.tabs.length; i++) {
						var lTab = getTabById( lWin.tabs, window.tabs[i].id );
						var sTab = getTabByGuid( sWin.tabs, lTab.guid );

						sTab.index = window.tabs[i].index;
					}
					
					if( callback && typeof( callback ) === "function" ) {
						callback();
					}
				});
			});
		});
	});
}
function tabRemovedEvent( tabId, removeInfo ) {

	// Only remove tabs if the tabs was closed
	// isWindowClosing is true if window was closed
	if( removeInfo.isWindowClosing ) {

		// Setup fast remove if needed
		setupOnRemovedEvent();
		return;
	}
	
	saveChangesToStorage(function ( syncWindows, localWindows, callback ) {	
		var lWin = findWindowByTabId( localWindows, tabId );

		// If the window is closing, then remove window
		if( lWin.tabs.length === 1) {			
			var winGuid = -1;

			// Remove window from local storage
			for( var i = 0; i < localWindows.length; i++ ) {
				if( localWindows[i].id === lWin.id ) {
					winGuid = localWindows[i].guid;
					localWindows.splice(i, 1);
					break;
				}
			}

			// Remove window from sync storage
			for( var i = 0; i < syncWindows.length; i++ ) {
				if( syncWindows[i].guid === winGuid ) {
					syncWindows.splice(i, 1);
					break;
				}
			}
		
		// If it is just a tab, remove tab
		} else {
			var sWin = getWindowByGuid( syncWindows, lWin.guid );
			var tabGuid = -1;
			
			// Remove tab from local storage
			for( var i = 0; i < lWin.tabs.length; i++ ) {
				if( lWin.tabs[i].id === tabId ) {
					tabGuid = lWin.tabs[i].guid;
					lWin.tabs.splice(i, 1);
					break;
				}
			}

			// Remove tab from sync storage
			for( var i = 0; i < sWin.tabs.length; i++ ) {
				if( sWin.tabs[i].guid === tabGuid ) {
					sWin.tabs.splice(i, 1);
					break;
				}
			}
		}

		if( callback && typeof( callback ) === "function" ) {
			callback();
		}
	});
}

//
// If there is only 1 tab left in local storage
// and it is closed, act fast to clear sync storage
/////////////////////////////////////////////////
function tabRemovedLastEvent( tabId, removeInfo ) {
	if( removeInfo.isWindowClosing )
		return;

	chrome.storage.sync.set( { "windows": syncCopy } );
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
	chrome.windows.get(id, { "populate": false }, function ( window ) {
		window.guid = GetGuid();
		
		var localWindow = { "id": window.id, "guid": window.guid, "tabs": [] };
		
		// Make position relative
		window.top = window.top / screen.height;
		window.left = window.left / screen.width;
		window.width = window.width / screen.width;
		window.height = window.height / screen.height;
		window.tabs = [];
		
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
	
	setupOnRemovedEvent();
	
	//chrome.extension.onRequest.addListener( listener.request );
}

//
// When there is only one open tab, setup remove tab event
// for a fast action.
///////////////////////////////////////////////////////////
function setupOnRemovedEvent() {	
	chrome.windows.getAll( { "populate": true }, function( windows ) {
		if( windows.length == 1 && windows[0].tabs.length == 1) {
			// Get local and sync storage
			chrome.storage.local.get("windows", function( localWindows ) {
				chrome.storage.sync.get("windows", function( syncWindows ) {
				
					// Get local and sync storage windows
					var lWin = getWindowById( localWindows.windows, windows[0].id );

					// Find and remove open window from sync windows
					for( var i = 0; i < syncWindows.windows.length; i++ ) {
						if( syncWindows.windows[i].guid === lWin.guid ) {
							syncWindows.windows.splice(i, 1);
							break;
						}
					}
					
					// This is what the sync storage would look like
					// if the current (only) window is closed
					syncCopy = syncWindows.windows;
					
					if( chrome.tabs.onRemoved.hasListener( tabRemovedEvent ) ) {
						chrome.tabs.onRemoved.removeListener( tabRemovedEvent );
					}
					if( ! chrome.tabs.onRemoved.hasListener( tabRemovedLastEvent ) ) {
						chrome.tabs.onRemoved.addListener( tabRemovedLastEvent );
					}
				});
			});
		} else {				
			if( chrome.tabs.onRemoved.hasListener( tabRemovedLastEvent ) ) {
				chrome.tabs.onRemoved.removeListener( tabRemovedLastEvent );
			}
			if( ! chrome.tabs.onRemoved.hasListener( tabRemovedEvent ) ) {
				chrome.tabs.onRemoved.addListener( tabRemovedEvent );
			}
		}
	});
}

//
// Remove functions to all tab events
/////////////////////////////////////////
function removeTabEvents( lastTab ) {
	chrome.tabs.onCreated.removeListener( tabCreatedEvent );
	chrome.tabs.onUpdated.removeListener( tabUpdatedEvent );
	chrome.tabs.onMoved.removeListener( tabMovedEvent );
	chrome.tabs.onDetached.removeListener( tabDetachedEvent );
	chrome.tabs.onAttached.removeListener( tabAttachedEvent );
	chrome.tabs.onRemoved.removeListener( tabRemovedEvent );
	chrome.tabs.onRemoved.removeListener( tabRemovedLastEvent );
	
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

//
// Wait until the listener is removed then callback
/////////////////////////////////////////////
function removeListenerWait( event, listenerFunction, callback ) {
	event.removeListener( listenerFunction );
	removeListenerWaitDelay( event, listenerFunction, callback );
}
function removeListenerWaitDelay( event, listenerFunction, callback ) {
	// If the event still has the listener, try again in 100 ms
	while( event.hasListener( listenerFunction ) ) {
		setTimeout( function() {
			removeListenerWaitDelay( event, listenerFunction, callback );
		}, 100);
		
		return;
	}
	
	callback();
}