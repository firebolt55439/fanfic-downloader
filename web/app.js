$('#progress_bar').on('mdl-componentupgraded', function(){
	$('#progress_area').hide();
});
setTimeout(function(){
	document.querySelector('#progress_bar').MaterialProgress.setProgress(44);
	$('#progress_area').show();
}, 2000);