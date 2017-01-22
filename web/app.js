// Initialize progress bars.
$('#progress_bar_indet').on('mdl-componentupgraded', function() {
	$('#progress_area').hide();
	$('#checkmark').hide();
	$(this).hide();
});

// Check browser support.
var unsupported = false;
if(typeof(Worker) === "undefined" || !window.Worker) {
	console.warn("No web worker support.")
	unsupported = true;
}
if(unsupported){
	$('#unsupported_div').show();
}

// Helper function for forced downloads.
function downloadURI(uri, name) {
	// From http://stackoverflow.com/questions/3916191/download-data-url-file
	var link = document.createElement("a");
	link.download = name;
	link.href = uri;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	delete link;
}

// Initialize web worker.
var worker;
worker = new Worker("worker.js");
worker.onmessage = function(evt){
	var data = evt.data;
	var type = data[0];
	if(type == "progress_update"){
		var new_progress_percent = data[1];
		var on_chapter = data[2];
		document.querySelector('#progress_bar').MaterialProgress.setProgress(new_progress_percent);
		$('#progress_status').text("Downloading chapter " + on_chapter.toString() + "...");
	} else if(type == "story_info"){
		var header = data[1];
		var html = '<li class="mdl-list__item mdl-list__item--three-line mdl-typography--text-left" style="margin-top: 0px; padding-top: 0px;"> \
			<span class="mdl-list__item-primary-content"> \
				<i class="material-icons mdl-list__item-avatar">person</i> \
				<span>' + header["author"] + ' - ' + header["title"] + '</span> \
				<span class="mdl-list__item-text-body" style="">' + header["summary"] + '</span> \
			</span> \
		</li>';
		$(html).appendTo($('#story-info-list'));
		$('#story-info-list').show();
	} else if(type == "start_stage_2"){
		$('#progress_bar').hide();
		$('#progress_bar_indet').show();
		$('#progress_status').text("Packaging story...");
	} else if(type == "success"){
		$('#progress_bar').hide();
		$('#progress_bar_indet').hide();
		$('#checkmark').show();
		$('#progress_status').text("Done!");
		$('#download_btn').removeAttr('disabled');
	} else if(type == "status_update"){
		$('#progress_status').text(data[1]);
	} else if(type == "error"){
		var error_message = data[1];
		var snackbarContainer = document.querySelector('#demo-toast-example');
		setTimeout(function() {
			snackbarContainer.MaterialSnackbar.showSnackbar({
				message: error_message,
				timeout: 5000,
				actionHandler: function(){
					setTimeout(function() {
						//console.log(snackbarContainer.MaterialSnackbar);
						snackbarContainer.MaterialSnackbar.cleanup_();
					}, 50);
				},
				actionText: "OK"
			});
			$('#download_btn').removeAttr('disabled');
			document.querySelector('#progress_bar').MaterialProgress.setProgress(0);
			$('#progress_bar_indet').hide();
			$('#progress_status').text("An error occurred.");
		}, 10);
	} else if(type == "download_data_url"){
		var data_url = data[1];
		setTimeout(function() {
			downloadURI(data_url, "story.epub");
			URL.revokeObjectURL(data_url);
		}, 20);
	}
}

// Install click handler on download button.
$('#download_btn').click(function() {
	// Don't execute handler if button is disabled.
	if($(this).attr('disabled')) return;

	// Reset progress elements.
	document.querySelector('#progress_bar').MaterialProgress.setProgress(0);
	$('#progress_area').show();
	$('#checkmark').hide();
	$('#progress_bar_indet').hide();
	$('#progress_bar').show();

	// Sanitize the story url.
	var ffn_url = $('#ffn_url').val();
	if(ffn_url.indexOf("www.") == 0){
		ffn_url = "http://" + ffn_url;
	}

	// Send background worker the task.
	worker.postMessage([
		"story_url",
		ffn_url
	]);

	// Update progress elements.
	$('#progress_status').text("Initializing...");
	$('#download_btn').attr('disabled', ''); // disable download button so no race conditions (e.g. submit while working)
});





























