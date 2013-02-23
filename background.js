/*
 * Tab Auto Sync
 * 
 * Author: Kyle Barnhart
 *
 * https://chrome.google.com/webstore/detail/tab-auto-sync/pglfmdocdcdahjhgcbpjmbglpeenmmef
*/

var REMOVE_LISTENER_WAIT_DELAY = 25; // milliseconds

// Selected profile data resides in %profilename#Windows
var profileWindowKey = "DefaultWindows";

// This is so that when the last open tab is closed,
// it gets removed properly.
// Hopefully a way can be found to remove this so that
// Auto-Tab-Sync can be non-persistant
var syncCopy = [];
var isSyncCopyPopup = false;
 
//
// Show saved tabs when browser opens
///////////////////////////////////////////
chrome.runtime.onStartup.addListener( function() {
	chrome.storage.local.get( "power", function( data ) {
		if( ( ! data ) || data.power !== false ) {
			start();
		} else {
			stop();
		}
	});
});

//
// When updating Tab Auto Sync, migrate tabs and profiles from bookmark to storage
///////////////////////////////////////////
chrome.runtime.onInstalled.addListener( function( details ) {
	if( details.reason == "install" ) {
		start();
	}
});

//
// Messeges
///////////////////////////////////////////
chrome.extension.onMessage.addListener( function( message ) {
	if( message === "start" ) {
		start();
	}
	
	if( message === "stop" ) {
		stop();
	}

	// If profile was changed, save name, restart
	if( message.profile ) {

		// Remove storage change event
		removeListenerWait(chrome.storage.onChanged, onSyncStorageChange, function() {
		
			// save local changes to storage
			chrome.storage.local.set( { 'profile': message.profile }, start );
		});
	}
});

//
// When the storage changes
///////////////////////////////////////////
function onSyncStorageChange( callback ) {
	chrome.storage.sync.get( profileWindowKey, function( syncWindows ) {
		chrome.storage.local.get( profileWindowKey, function( localWindows ) {
			syncWindows = syncWindows[ profileWindowKey ];
			localWindows = localWindows[ profileWindowKey ];
			
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
					var jsonObj = {};
					jsonObj[ profileWindowKey ] = localWindows;
					
					// save local changes to storage
					chrome.storage.local.set( jsonObj, function() {
						
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
// Start Tab Auto Sync
// get synced data and open tabs
///////////////////////////////////////////
function start() {
	//chrome.storage.sync.remove( profileWindowKey ); // for debugging

	// Set icons
	chrome.storage.local.set( { "power": true }, function() {
		chrome.browserAction.setIcon( { "path": {'19': 'icon19.png', '38': 'icon38.png' } } );
	});
	
	// Set Title
	chrome.browserAction.setTitle( { "title": "On" } );
	
	// Set profile name
	chrome.storage.sync.get( "profiles", function( profiles ) {
		chrome.storage.local.get( "profile", function( name ) {
			profiles = profiles.profiles;
			name = name.profile;
			
			if( Object.prototype.toString.call( profiles ) !== '[object Array]' ) {
				profiles = [];
			}
			
			if( Object.prototype.toString.call( name ) !== '[object String]' ) {
				name = "Default";
			}
			
			// If not profiles are found, add name (Default)
			if( profiles.length == 0 ) {
				profiles.push( name );
			}
			
			// Make sure current profle name is in array of profiles
			var found = false;
			for(var i = 0; i < profiles.length; i++ ) {
				if( profiles[i] === name ) {
					found = true;
				}
			}
			
			// If name is not is list of profiles
			// change name to the first profile
			if( ! found ) {
				name = profiles[0];
			}
			
			// Setup data location
			profileWindowKey = name + "Windows";
		
			// Remove listener
			removeListenerWait( chrome.storage.onChanged, onSyncStorageChange, function() {

				// Save profile changes
				// then start the initial sync
				chrome.storage.local.set( { "profile": name }, function() {
					chrome.storage.sync.set( { "profiles": profiles }, startSync );
				});
			});
		});
	});	
}

//
// Initial sync at start
///////////////////////////////////////////
function startSync() {
	// Clear local storage then get sync storage
	chrome.storage.local.remove( profileWindowKey, function() {

		chrome.windows.getAll( { "populate": true }, function( windows ) {
			chrome.storage.sync.get( profileWindowKey, function( syncWindows ) {
				chrome.storage.local.get( profileWindowKey, function( localWindows ) {
				
					// Fiddle with sync data to get an array of windows (could be empty)
					if( syncWindows &&
						syncWindows[ profileWindowKey ] &&
						Object.prototype.toString.call( syncWindows[ profileWindowKey ]) === '[object Array]' )
					{
						syncWindows = syncWindows[ profileWindowKey ];
					} else {
						syncWindows = [];
					}
					
					// Fiddle with local data to get an array of windows (could be empty)
					if( localWindows &&
						localWindows[ profileWindowKey ] &&
						Object.prototype.toString.call( localWindows[ profileWindowKey ] ) === '[object Array]' )
					{
						localWindows = localWindows[ profileWindowKey ];
					} else {
						localWindows = [];
					}
					
					// Stop tab and windows events
					removeTabEvents();
					
					// Sync windows
					updateWindows( syncWindows, localWindows, function() {
						
						// Remove storage change event
						removeListenerWait(chrome.storage.onChanged, onSyncStorageChange, function() {
							var jsonObj = {};
							jsonObj[ profileWindowKey ] = localWindows;
							
							// save local changes to storage
							chrome.storage.local.set( jsonObj, function() {
								
								var finish = function() {
									// Add storage change event
									chrome.storage.onChanged.addListener( onSyncStorageChange );
									
									// start events
									addTabEvents();
								};
								
								// When opening chrome and there is no opening content
								// (one window, one tab, and it's the newtab)
								// and there is content to sync, only then ignore the initial window
								if( syncWindows.length > 0 &&
									windows.length == 1 &&
									windows[0].tabs.length == 1 &&
									windows[0].tabs[0].url === "chrome://newtab/"
								) {
									chrome.windows.remove( windows[0].id, finish );
								} else {
									saveStartState( finish );
								}
							});
						});
					});
				});
			});
		});
	});
}

//
// Turn off tab auto sync
///////////////////////////////////////////
function stop() {
	// Stop tab and windows events
	removeTabEvents();
	
	// Remove storage change event
	chrome.storage.onChanged.removeListener( onSyncStorageChange );
	
	// Set icons
	chrome.storage.local.set( { "power": false }, function() {
		chrome.browserAction.setIcon( { "path": {'19': 'icon19grey.png', '38': 'icon38grey.png' } } );
	});
	
	// Set title 
	chrome.browserAction.setTitle( { "title": "Off" } );
}

//
// Create all missing windows and tabs
///////////////////////////////////////////
function updateWindows( syncWindows, localWindows, callback ) {
	
	// Need both id and guid
	var removeWindows = [];

	// Create list of windows to remove
	for( var i = 0; i < localWindows.length; i++) {
		if( ! getWindowByGuid( syncWindows, localWindows[i].guid ) ) {
			removeWindows.push( localWindows[i] );
		}
	}

	// Recursively remove and update windows
	updateWindow( localWindows, syncWindows, 0, function() {
		removeWindow( localWindows, removeWindows, 0, function() {
			if( callback && typeof( callback ) === "function" ) {
				callback();
			}
		});
	});
}

//
// Create a new window
///////////////////////////////////////////
function updateWindow( localWindows, syncWindows, index, callback ) {

	// If all windows have been created, finish and callback
	if( syncWindows.length <= index &&
		callback &&
		typeof( callback ) === "function" )
	{
		callback();
		return;
	}
	
	var sWin = syncWindows[index];
	var lWin = getWindowByGuid( localWindows, sWin.guid );
	
	// Window properties
	var props = {};
	
	// If the window is horizontally on screen, set the left and width
	if( sWin.left &&
		sWin.width &&
		sWin.left < 1 &&
		sWin.left + sWin.width > 0 )
	{
		props.left = Math.round( sWin.left * screen.width );
		props.width = Math.round( sWin.width * screen.width );
	}
	
	// If the window is vertically on screen, set the top and height
	if( sWin.top &&
		sWin.height &&
		sWin.top < 1 &&
		sWin.top + sWin.height > 0 )
	{
		props.top = Math.round( sWin.top * screen.height );
		props.height = Math.round( sWin.height * screen.height );
	}
	
	// If window doesn't exist, create it
	if( ! lWin ) {
		// Create properties
		if( sWin.type )
			props.type = sWin.type;
		
		if( sWin.incognito )
			props.incognito = sWin.incognito;
			
		// Create window
		chrome.windows.create( props, function( newWindow ) {
			chrome.windows.get( newWindow.id, { "populate": true }, function( window ) {
				lWin = { "id": newWindow.id, "guid": sWin.guid, "tabs": [] };

				// Add window to local storage
				localWindows.push( lWin );
				
				// Update tabs
				updateTabs( sWin, lWin, function() {
					
					// Remove first tab (popups might have no tabs)
					if( window.tabs.length > 0 ) {
						chrome.tabs.remove( window.tabs[0].id, function() {
							// Update next window
							updateWindow( localWindows, syncWindows, index + 1, callback );
						});
					} else {
						// Update next window
						updateWindow( localWindows, syncWindows, index + 1, callback );
					}
				});
			});
		});
	
	// If window does exist, update properties
	} else {
		chrome.windows.update( lWin.id, props, function( window ) {
			updateTabs( sWin, lWin, function() {
				
				// Update next window
				updateWindow( localWindows, syncWindows, index + 1, callback );
			});
		});
	}
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
function updateTabs( syncWindow, localWindow, callback ) {
	
	// Need both id and guid
	var removeTabs = [];
	
	var sTabs = syncWindow.tabs;
	var lTabs = localWindow.tabs;
	
	// Sort tabs by index number
	sTabs.sort( function( a, b ) {
		return a.index - b.index;
	});

	// Create list of tabs to remove
	for( var i = 0; i < lTabs.length; i++) {
		if( ! getTabByGuid( sTabs, lTabs[i].guid ) ) {
			removeTabs.push( lTabs[i] );
		}
	}
	
	// Recursively create missing windows
	updateTab( localWindow, sTabs, 0, function () {		
		removeTab( localWindow, removeTabs, 0, function() {
			if( callback && typeof( callback ) === "function" ) {
				callback();
			}
		});
	});
}

//
// Create single tab
///////////////////////////////////////////
function updateTab( localWindow, syncTabs, index, callback ) {
	
	// If all tabs have been created, finish and callback
	if( syncTabs.length <= index &&
		callback &&
		typeof( callback ) === "function" )
	{
		callback();
		return;
	}

	var sTab = syncTabs[index];
	var lTab = getTabByGuid( localWindow.tabs, sTab.guid );
	
	var props = {};
	
	// URL
	props.url = sTab.url;
	
	// Active
	props.active = false;
	if( sTab.active )
		props.active = sTab.active;
	
	// Pinned tab
	if( sTab.pinned )
		props.pinned = sTab.pinned;

	// Create tab if it does not exist
	if( ! lTab ) {
		// Window ID
		props.windowId = localWindow.id;
		
		chrome.tabs.create( props, function( tab ) {	

			// Add tab to local storage
			localWindow.tabs.push( { "id": tab.id, "guid": sTab.guid } );
			
			// Update next tab
			updateTab( localWindow, syncTabs, index + 1, callback );
		});
	
	// If tab exists update it
	} else {
		chrome.tabs.update( lTab.id, props, function( tab ) {
			
			// Update next tab
			updateTab( localWindow, syncTabs, index + 1, callback );
		});
	}
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
	chrome.storage.sync.get( profileWindowKey, function( syncWindows ) {
		chrome.storage.local.get( profileWindowKey, function( localWindows ) {
			
			syncWindows = syncWindows[ profileWindowKey ];
			localWindows = localWindows[ profileWindowKey ];
		
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
						var jsonObj = {};
						jsonObj[ profileWindowKey ] = localWindows;
						
						// Save windows
						chrome.storage.local.set( jsonObj, function() {
							jsonObj[ profileWindowKey ] = syncWindows;
							
							chrome.storage.sync.set( jsonObj, function() {

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
function saveStartState( callbackStart ) {	
	// Wreate windows and tabs for storage
	saveChangesToStorage(function ( syncWindows, localWindows, callbackStorage ) {	
		chrome.windows.getAll({ "populate": true }, function ( windows ) {
			saveStartIteration( syncWindows, localWindows, windows, 0, callbackStorage );
		});
	}, callbackStart );
}
// Doing this recursively will save storage access time
function saveStartIteration( syncWindows, localWindows, openWindows, index, callback ) {
	// If all windows have been removed, finish and callback
	if( openWindows.length <= index &&
		callback &&
		typeof( callback ) === "function" )
	{
		callback();
		return;
	}
	
	var window = openWindows[index];
	
	// Save window and tabs
	saveWindowsTabs( syncWindows, localWindows, openWindows[index], function() {
		
		// Save next window
		saveStartIteration( syncWindows, localWindows, openWindows, index + 1, callback )
	});
}

//
// Tab Events
//////////////////////////////////////
function genericUpdateEvent( windowId ) {
	
	// Updates and creates windows and tabs
	saveChangesToStorage(function ( syncWindows, localWindows, callback ) {
	
		// Get the window
		chrome.windows.get(windowId, { "populate": true }, function ( window ) {
			
			// Save changes
			saveWindowsTabs( syncWindows, localWindows, window, callback );
		});
	});
}
function tabCreatedEvent( tab ) {
	genericUpdateEvent( tab.windowId );
}
function tabUpdatedEvent( tabId, changeInfo, tab ) {
	if( changeInfo.status === "loading" ) {
		genericUpdateEvent( tab.windowId );
	}
}
function tabMovedEvent( tabId, moveInfo ) {
	genericUpdateEvent( moveInfo.windowId );
}
function tabDetachedEvent( tabId ) {
	tabRemovedEvent( tabId, { "isWindowClosing": false } );
}
function tabAttachedEvent( tabId, attachInfo ) {
	genericUpdateEvent( attachInfo.newWindowId );
};
function tabRemovedEvent( tabId, removeInfo ) {
	saveChangesToStorage(function ( syncWindows, localWindows, callback ) {
		var finish = function() {
			if( callback && typeof( callback ) === "function" ) {
				callback();
			}
		};
		
		var lWin = findWindowByTabId( localWindows, tabId );
		var sWin = getWindowByGuid( syncWindows, lWin.guid );
		
		// Only remove tabs if the tab was closed, or if popup is true and window closing
		// isWindowClosing is true if window was closed
		// No callback mean no saving, fast remove setup does run
		if( removeInfo.isWindowClosing && sWin.type === "normal" ) {
			finish();
			return;
		}
		
		// Either an array of windows or array of tabs
		var localContent;
		var syncContent;
		var contentId;
		
		// If the window is closing, then remove window
		if( lWin.tabs.length === 1 ) {			
			localContent = localWindows;
			syncContent = syncWindows;
			contentId = lWin.id;

		// If it is just a tab, remove tab
		} else {
			localContent = lWin.tabs;
			syncContent = sWin.tabs;
			contentId = tabId;
		}
	
		var contentGuid = -1;

		// Remove tab/window from local storage
		for( var i = 0; i < localContent.length; i++ ) {
			if( localContent[i].id === contentId ) {
				contentGuid = localContent[i].guid;
				localContent.splice(i, 1);
				break;
			}
		}

		// Remove tab/window from sync storage
		for( var i = 0; i < syncContent.length; i++ ) {
			if( syncContent[i].guid === contentGuid ) {
				syncContent.splice(i, 1);
				break;
			}
		}

		finish();
	});
}

//
// If there is only 1 tab left in local storage
// and it is closed, act fast to clear sync storage
/////////////////////////////////////////////////
function tabRemovedLastEvent( tabId, removeInfo ) {
	if( removeInfo.isWindowClosing === true && isSyncCopyPopup === false )
		return;
	
	// Remove listener
	// This is required because google instant will close the last tab
	// firing the storage onChange event and closing Chrome.
	removeListenerWait( chrome.storage.onChanged, onSyncStorageChange, function() {
		var jsonObj = {};
		jsonObj[ profileWindowKey ] = syncCopy;
		
		chrome.storage.sync.set( jsonObj );
	});
}

//
// Check if window exists, if it doesn't create it
// Takes window instead of windowId to reduce chrome.windows.get calls
///////////////////////////////////////
function saveWindowsTabs( syncWindows, localWindows, window, callback ) {
	var lWin = getWindowById( localWindows, window.id );
	var sWin;

	// If window doesn't exist in storage create it
	if( ! lWin ) {	
		sWin = {};
		sWin.id = window.id;
		sWin.guid = GetGuid();
		sWin.tabs = [];
		
		lWin = { "id": sWin.id, "guid": sWin.guid, "tabs": [] };
		
		// Save local and sync storage windows
		localWindows.push( lWin );
		syncWindows.push( sWin );
	
	// If window exists
	} else {
		sWin = getWindowByGuid( syncWindows, lWin.guid );
	}
	
	// Update window properties
	sWin.focused = window.focused;
	sWin.top = window.top / screen.height;
	sWin.left = window.left / screen.width;
	sWin.width = window.width / screen.width;
	sWin.height = window.height / screen.height;
	sWin.incognito = window.incognito;
	sWin.type = window.type;
	
	// Update all tabs
	for( var i = 0; i < window.tabs.length; i++ ) {
		var tab = window.tabs[i];
		
		// Get tabs		
		var lTab = getTabById( lWin.tabs, tab.id );
		var sTab;
		
		// If tab doesn't exist create it
		if( ! lTab ) {
			sTab = {};
			sTab.id = tab.id;
			sTab.guid = GetGuid();
			
			lTab = { "id": sTab.id, "guid": sTab.guid };

			lWin.tabs.push( lTab );
			sWin.tabs.push( sTab );

		// If tab exists
		} else {
			sTab = getTabByGuid( sWin.tabs, lTab.guid );
		}
		
		// Update tab properties
		sTab.index = tab.index;
		sTab.active = tab.active;
		sTab.pinned = tab.pinned;
		sTab.url = tab.url;
	}
	
	if( callback && typeof( callback ) === "function" ) {
		callback();
	}
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
}

//
// When there is only one open tab, setup remove tab event
// for a fast action.
///////////////////////////////////////////////////////////
function setupOnRemovedEvent() {
	chrome.windows.getAll( { "populate": true }, function( windows ) {
		if( windows.length == 1 && windows[0].tabs.length == 1) {

			// Get local and sync storage
			chrome.storage.local.get(profileWindowKey, function( localWindows ) {
				chrome.storage.sync.get(profileWindowKey, function( syncWindows ) {
					localWindows = localWindows[ profileWindowKey ];
					syncWindows = syncWindows[ profileWindowKey ];
					
					if( Object.prototype.toString.call( syncWindows ) !== '[object Array]' ) {
						syncWindows = [];
					}
					
					if( Object.prototype.toString.call( localWindows ) !== '[object Array]' ) {
						localWindows = [];
					}
					
					// Get local and sync storage windows
					var lWin = getWindowById( localWindows, windows[0].id );
					
					// Find and remove open window from sync windows
					for( var i = 0; i < syncWindows.length; i++ ) {
						if( syncWindows[i].guid === lWin.guid ) {
							syncWindows.splice(i, 1);
							break;
						}
					}
					
					// This is what the sync storage would look like
					// if the current (only) window is closed
					syncCopy = syncWindows;
					
					isSyncCopyPopup = false
					if( windows[0].type !== "normal" ) {
						isSyncCopyPopup = true;
					}

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
	
	// If the event still has the listener, try again in ms
	while( event.hasListener( listenerFunction ) ) {
		setTimeout( function() {
			removeListenerWait( event, listenerFunction, callback );
		}, REMOVE_LISTENER_WAIT_DELAY);
		
		return;
	}
	
	callback();
}