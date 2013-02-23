/*
 * Tab Auto Sync
 * 
 * Author: Kyle Barnhart
 *
 * https://chrome.google.com/webstore/detail/tab-auto-sync/pglfmdocdcdahjhgcbpjmbglpeenmmef
*/
// New profile name must be 3 characters and only letters, number, underspace, spaces
var profilePattern = /^[\w ]+$/;

window.onload = function() {
	
	// Set up clear button
	document.getElementById("clear").onclick = function() {
		var confirmCheck = document.getElementById( "confirm" );
		
		// Make sure confirm checkbox is checked
		if( ! confirmCheck.checked ) {
			return;
		}
	
		chrome.storage.sync.get( "profiles", function( syncData ) {
		
			// If there are no profiles, stop
			if( ! ( syncData &&
					syncData.profiles &&
					Object.prototype.toString.call( syncData.profiles ) === '[object Array]' ) )
			{
				return;
			}
			
			// For each profile, set the date key name
			for( var i = 0; i < syncData.profiles.length; i++ ) {
				syncData.profiles[i] = syncData.profiles[i] + "Windows";
			}
			
			// Clear all window and tab data
			chrome.extension.sendMessage( "stop" );
			chrome.storage.sync.remove( syncData.profiles, function() {
				chrome.extension.sendMessage( "start" );
			});
		});
	};
	
	// Add profile buttom click
	document.getElementById("addProfileButton").onclick = function() {
		var newName = document.getElementById("addProfile").value;
		
		if( ! ( newName ) ||
			newName.length < 3 ||
			! ( profilePattern.test( newName ) )
		) {
			alert( "Invalid profile name\n - Must be at least 3 characters\n - Only number, letters, underscores, and spaces" );
			return;
		}
	
		chrome.storage.sync.get( "profiles", function( syncData ) {
			// If there are no profiles, make array empty
			if( ! ( syncData &&
				syncData.profiles &&
				Object.prototype.toString.call( syncData.profiles ) === '[object Array]' ) )
			{
				syncData.profiles = [];
			}

			syncData.profiles.push( newName );
			
			chrome.storage.sync.set( { "profiles": syncData.profiles }, function() {
				setupProfileTable();
			});
		});
	};
	
	setupProfileTable();
};

function setupProfileTable() {
	// Sets the table with a list of profiles
	chrome.storage.sync.get( "profiles", function( syncData ) {
		
		// If there are no profiles, stop
		if( ! ( syncData &&
				syncData.profiles &&
				Object.prototype.toString.call( syncData.profiles ) === '[object Array]' ) )
		{
			return;
		}
		
		var profileTable = document.getElementById( "profiles" );
		
		// Clear any existing rows
		while( profileTable.rows.length > 1 ) {
			profileTable.deleteRow( 1 ); 
		}

		// Add each profule name
		for( var i = 0; i < syncData.profiles.length; i++ ) {
			var row = profileTable.insertRow( -1 );
			var cell1 = row.insertCell(0);
			var cell2 = row.insertCell(1);
			cell1.innerHTML = syncData.profiles[i];
			cell2.innerHTML = "<input data-profile='" + syncData.profiles[i] + "' class='clearProfile' type='submit' value='Clear'> <input data-profile='" + syncData.profiles[i] + "' class='deleteProfile' type='submit' value='Delete'>";
		}
		
		var inputs = document.getElementsByTagName("input");
		
		for( var i = 0; i < inputs.length; i++ ) {
		
			// If it is a clear profile button
			if( inputs[i].getAttribute("class") === "clearProfile" ) {
				inputs[i].onclick = clearProfile;
			}
			
			// If it is a delete profile button
			if( inputs[i].getAttribute("class") === "deleteProfile" ) {
				inputs[i].onclick = deleteProfile;
			}
		}
	});
}

function clearProfile() {
	// Confirm
	if( ! confirm( "Confirm clear." ) ) {
		return;
	}
	var that = this.getAttribute("data-profile");
	chrome.storage.sync.remove( this.getAttribute("data-profile") + "Windows" );
}

function deleteProfile() {
	// Confirm
	if( ! confirm( "Confirm delete." ) ) {
		return;
	}
	
	var profileName = this.getAttribute("data-profile");
	
	chrome.storage.sync.get( "profiles", function( syncData ) {
	
		// If there are no profiles, stop
		if( syncData &&
			syncData.profiles &&
			Object.prototype.toString.call( syncData.profiles ) === '[object Array]' )
		{
			// Remove profile from array
			for( var i = 0; i < syncData.profiles.length; i++ ) {
				if( syncData.profiles[i] === profileName ) {
					syncData.profiles.splice(i, 1);
					break;
				}
			}
		
		// If there are no profile, leave it an empty array
		} else {
			syncData.profiles = [];
		}
		
		// If there are no profiles, add "Default"
		if( syncData.profiles.length == 0 ) {
			syncData.profiles.push("Default");
		}
		
		chrome.storage.sync.set( { "profiles": syncData.profiles }, function() {
			
			// If the current profile was deleted, restart tab auto sync
			chrome.storage.local.get( "profile", function( localData ) {
				
				if( localData && localData.profile && localData.profile === profileName ) {
					chrome.extension.sendMessage( { "profile": syncData.profiles[0] } );
				}
				
				chrome.storage.sync.remove( profileName + "Windows" );
			});
		});
	});
}