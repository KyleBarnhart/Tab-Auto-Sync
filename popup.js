/*
 * Tab Auto Sync
 * 
 * Author: Kyle Barnhart
 *
 * https://chrome.google.com/webstore/detail/tab-auto-sync/pglfmdocdcdahjhgcbpjmbglpeenmmef
*/

window.onload = function() {
	// Get the on/off setting and adjust the text link
	chrome.storage.local.get( "power", function( data ) {
		var power = true;
		
		// The setting is set in background.js
		if( data && data.power === false ) {
			power = false;
		}

		var powerButton = document.getElementById("power");

		if( power ) {
			powerButton.innerHTML = "Turn Off";
		}
		
		// Set action to take when link is clicked
		powerButton.onclick = powerButtonOnClick;
	});
	
	// Set up settings page link
	document.getElementById("settings").onclick = function() {
		chrome.tabs.create({
			url: "options.html"
		});
	};
	
	// Sets the combobox with a list of profiles
	chrome.storage.sync.get( "profiles", function( data ) {
		chrome.storage.local.get( "profile", function( localData ) {
			
			// If there are profiles, the default is the first one
			var selectedProfile = "Default";
			
			// If there is a selected profile, use that
			if ( localData && localData.profile ) {
				selectedProfile = localData.profile;
			}
			
			var profileCombo = document.getElementById( "profiles" );
			
			// If are profiles found
			if( data && data.profiles && data.profiles.length > 0 ) {
				
				// Add each profule name
				for( var i = 0; i < data.profiles.length; i++ ) {
					var option = document.createElement( "option" );
					option.text = data.profiles[i];
					
					// Set option selected if option is the selected profile
					if( selectedProfile === data.profiles[i] ) {
						option.selected = true;
					}

					profileCombo.add( option, null ) ;
				}
			
			// No profiles found, then add "Default"
			} else {
				var option = document.createElement( "option" );
				option.text = "Default";
				
				profileCombo.add( option, null ) ;
			}
			
			// Setup onchange event for select
			profileCombo.onchange = profileComboOnChange;
		});
	});
};

//
// This will send a message to background.js to turn on or off tab auto sync
// it will also change the link text
///////////////////////////////////////
function powerButtonOnClick() {
	chrome.storage.local.get( "power", function( data ) {
		var power = true;
		if( data && data.power === false ) {
			power = false;
		}
		
		var powerButton = document.getElementById("power");
		
		if( power ) {
			chrome.extension.sendMessage("stop");
			powerButton.innerHTML = "Turn On";
		} else {
			chrome.extension.sendMessage("start");
			powerButton.innerHTML = "Turn Off";
		}
	});
}

//
// Profile combobox change event
/////////////////////////////////////////
function profileComboOnChange() {
	var profileCombo = document.getElementById( "profiles" );

	var newName = profileCombo.options[ profileCombo.selectedIndex ].text;
	
	chrome.extension.sendMessage( { "profile": newName } );
}