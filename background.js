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