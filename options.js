/*
 * Tab Auto Sync
 * 
 * Author: Kyle Barnhart
 *
 * https://chrome.google.com/webstore/detail/tab-auto-sync/pglfmdocdcdahjhgcbpjmbglpeenmmef
*/

document.addEventListener('DOMContentLoaded', function () {
	restore_options();
});

var profileArray;
var otherBookmarksID;

function changeProfile(name) {
	if (!name) {
		name = "default";
	}

	localStorage["profile"] = name;
	
	chrome.extension.sendRequest({'profile': true});
}

// Saves options to localStorage.
function save_options() {
	var delayInput = document.getElementById("delay");
	var delay = parseInt(delayInput.value);

	var startInput = document.getElementsByName("start");
	for(var i = 0; i < startInput.length; i++) {
		if(startInput[i].checked) {
			localStorage["startRunning"] = startInput[i].value;
		}
	}
	
	if(isFinite(delay) && delay >= 100 && delay <= 30000) {
		localStorage["delay"] = delay;
		  
		status.innerHTML = "Options Saved.";
		setTimeout(function() {
			status.innerHTML = "";
		}, 750);
	} else {
		if(delay < 100) {
			status.innerHTML = "Delay must be greater than 100.";
		} else if(delay > 30000) {
			status.innerHTML = "Delay must be less than 30000.";
		} else {
			status.innerHTML = "Please enter a number for delay.";
		}
		
		setTimeout(function() {
			status.innerHTML = "";
		}, 2000);
	}
}

// Restores select box state to saved value from localStorage.
function restore_options() {
	var delay = localStorage["delay"];
	var start = localStorage["startRunning"];
	var profile = localStorage["profile"];

	if (!delay) {
		delay = 2000;
		localStorage["delay"] = delay;
	}

	if (!start) {
		start = true;
		localStorage["start"] = start;
	}

	if (!profile) {
		alert(profile);
		profile = "default";
		changeProfile(profile);
	}

	profileArray = new Array();	
	var title = "Tab Auto Sync Bookmark";

	chrome.bookmarks.getTree(function(tree) {
		
		otherBookmarksID = tree[0].children[1].id;
		
		tree[0].children[1].children.forEach(function(node) {
			if(node.title.substr(0, 22) == title) {				
				if(node.title.length > 22) {
					profileArray.push(node.title.substr(24, node.title.length - 25));
				} else {
					profileArray.push("default");
				}
			}
		});

		var profileDiv = document.getElementById("profileDiv");
		profileDiv.innerHTML = "";
		
		var profileFound = false;
		for(var i = 0; i < profileArray.length; i++) {
			profileDiv.innerHTML += '<input name="profile" type="radio" value="' + profileArray[i] + '">' + profileArray[i] + '<br />';
		}
		
		var profileInput = document.getElementsByName("profile");
		for(var i = 0; i < profileInput.length; i++) {
			if(profileInput[i].value == profile) {
				profileInput[i].checked = true;
				profileFound = true;
			}
		}

		if(!profileFound) {
			profile = "default";
			changeProfile(profile);

			profileDiv.innerHTML += '<input name="profile" type="radio" value="default" checked="true">default<br />';
		}
	});	
	  
	var delayInput = document.getElementById("delay");
	delayInput.value = delay;
	  
	var startInput = document.getElementsByName("start");
	switch(start)
	{
	case "last":
	  startInput[2].checked = true;
	  break;
	case "false":
	  startInput[1].checked = true;
	  break;
	default:
	  startInput[0].checked = true;
	}
}

function add_profile() {
	var nameInput = document.getElementById("profileName");
	var name = nameInput.value;

	var errors = document.getElementById("profileErrors");
	errors.innerHTML = "";
	var errorsFound = false;

	var duplicate = (name.toLowerCase() == "default");
	for(var i = 0; i < profileArray.length; i++) {
		if(profileArray[i].toLowerCase() == name) {
			duplicate = true;
		}
	}

	if(duplicate) {
		errors.innerHTML += "Profile name must be unique.<br />";
		errorsFound = true;
	}

	var patt = new RegExp("^[0-9a-zA-Z_][0-9a-zA-Z_ ]*[0-9a-zA-Z_]$");

	if(!patt.test(name)) {
		errors.innerHTML += "Profile name can only contain numbers, letters, underscores, and spaces.  It cannot start or end with a space.<br />";
		errorsFound = true;
	}

	if(name.length < 2) {
		errors.innerHTML += "Profile name must be at least 2 characters.<br />";
		errorsFound = true;
	}

	if(name.length >= 250) {
		errors.innerHTML += "Profile name must conatin less than 250 characters.<br />";
		errorsFound = true;
	}

	if(!errorsFound) {
		chrome.bookmarks.create({'parentId': otherBookmarksID,
								 'title': "Tab Auto Sync Bookmark (" + name + ")",
								 'url': 'json:{"windows":[]}'},
								 function(result) {
									restore_options();
									
									var status = document.getElementById("status");
									status.innerHTML = "Profile added.";
									
									setTimeout(function() {
										status.innerHTML = "";
									}, 750);
								 });
	}
}

function delete_profile() {
	var profileInput = document.getElementsByName("profile");
	var profile;
	for(var i = 0; i < profileInput.length; i++) {
		if(profileInput[i].checked) {
			profile = profileInput[i].value;
		}
	}

	var errors = document.getElementById("profileErrors");
	errors.innerHTML = "";

	if(profile.toLowerCase() == "default") {
		errors.innerHTML = "Cannot delete the default profile.<br />";

	} else {
		chrome.bookmarks.getChildren(otherBookmarksID, function(children) {
			var found = false;
			
			children.forEach(function(node) {
				if(node.title.length > 24 && node.title.substr(24, node.title.length - 25) == profile) {
					found = true;
					
					chrome.bookmarks.remove(node.id, function() {
						restore_options();
						
						var status = document.getElementById("status");
						status.innerHTML = "Profile removed.";
						
						setTimeout(function() {
							status.innerHTML = "";
						}, 750);
					});
				}
			});
			
			if(!found) {
				errors.innerHTML = "Cannot not find profile.<br />";
			}
		});	
	}
}

function select_profile() {
	var profileInput = document.getElementsByName("profile");
	for(var i = 0; i < profileInput.length; i++) {
		if(profileInput[i].checked) {
			if(localStorage["profile"] != profileInput[i].value) {
				changeProfile(profileInput[i].value);
			}
		}
	}
	
	var status = document.getElementById("status");
	
	status.innerHTML = "Profile Selectes";
	
	setTimeout(function() {
		status.innerHTML = "";
	}, 2000);
}