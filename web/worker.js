var handle_story;

importScripts("js/subworkers.js");
importScripts("js/jszip.min.js");
importScripts("js/zip-js/zip.js");
importScripts("js/zip-js/zip-fs.js");
importScripts("js/xhtml-purifier.js");

// Initialize zip.js.
zip.workerScriptsPath = "js/zip-js/";

// Initialize Firebase.
/*
importScripts("https://www.gstatic.com/firebasejs/3.6.10/firebase.js");
var config = {
  apiKey: "AIzaSyCb9pGbRDoyWyrqmr41Yy6IEB-SRfnPoaQ",
  authDomain: "fanfic-downloader.firebaseapp.com",
  databaseURL: "https://fanfic-downloader.firebaseio.com",
  storageBucket: "fanfic-downloader.appspot.com",
  messagingSenderId: "419914920298"
};
firebase.initializeApp(config);
*/

// Initialize onmessage handler.
onmessage = function(evt){
	//console.log(evt);
	var data = evt.data;
	var type = data[0];
	if(type == "story_url"){
		var url = data[1];
		setTimeout(function() {
			handle_story(url);
		}, 10);
	}
}

// Define helper functions.
function getLocation(href) {
	// From http://stackoverflow.com/questions/736513/how-do-i-parse-a-url-into-hostname-and-path-in-javascript
    var match = href.match(/^(https?\:)\/\/(([^:\/?#]*)(?:\:([0-9]+))?)([\/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/);
    return match && {
        protocol: match[1],
        host: match[2],
        hostname: match[3],
        port: match[4],
        pathname: match[5],
        search: match[6],
        hash: match[7]
    }
}

function getBetween(subject, a, b){
	var aidx = subject.indexOf(a) + a.length;
	return subject.slice(aidx, aidx + subject.slice(aidx).indexOf(b));
}

function postError(msg){
	postMessage([
		"error",
		msg
	]);
}

function postStatus(msg){
	postMessage([
		"status_update",
		msg
	]);
}

function blobToDataURL(blob, callback) {
    var a = new FileReader();
    a.onload = function(e) {callback(e.target.result);}
    a.readAsDataURL(blob);
}

// Define main "workhorse" functions.
var handle_ffnet;
handle_story = function(story_url) {
	console.log("Downloading story with url %s", story_url);

	// Parse URL and hand off to correct domain-specific function.
	var parsed = getLocation(story_url);
	console.log(parsed);
	if(parsed === undefined || !parsed){
		postMessage([
			"error",
			"Invalid story URL!"
		]);
		return;
	}

	// Pass off to programmatic switchboard by hostname.
	var switchboard = [
		["fanfiction.net", "m.fanfiction.net", handle_ffnet]
	];
	var domain = parsed.hostname;
	if(domain.indexOf("www.") == 0){
		domain = domain.slice(4);
	}
	console.log("Fanfiction host: %s", domain);
	var handoff = undefined;
	for(var i = 0; i < switchboard.length; i++){
		var on = switchboard[i];
		if(on.indexOf(domain) !== -1){
			handoff = on[on.length - 1];
			break;
		}
	}
	if(handoff === undefined){
		postMessage([
			"error",
			"Unsupported fanfiction host!"
		]);
		return;
	}

	// Call switched function and retrieve story information and chapter texts
	// from returned data.
	var res = handoff(parsed);
	var header = res[0];
	var chapters = res[1];
	var story_id = res[2];
	postMessage(["start_stage_2"]);

	// Start generating the necessary files. //
	var EPUB = [];

	// Generate the chapter XHTML files.
	var num_chapters = header["chapter_titles"].length;
	for(var i = 0; i < num_chapters; i++){
		var chapter_on = i + 1;
		var xhtml = "<?xml version='1.0' encoding='utf-8'?> \
		<!DOCTYPE html> \
		<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" epub:prefix=\"z3998: http://www.daisy.org/z3998/2012/vocab/structure/#\" lang=\"en\" xml:lang=\"en\"> \
		  <head> \
		    <title>Reflections</title> \
		    <link href=\"main.css\" type=\"text/css\" rel=\"stylesheet\"/> \
		  </head> \
		  <body>" + chapters[i] + "</body> \
		</html>";
		EPUB.push(["chapter_" + chapter_on.toString() + ".xhtml", xhtml]);
	}

	// Generate the indexing and TOC files. //
	// Generate content.opf.
	var content_opf = "<?xml version='1.0' encoding='utf-8'?>";
	content_opf += '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" prefix="rendition: http://www.ipdf.org/vocab/rendition/#">';
	content_opf += '<metadata xmlns:opf="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"> \
      <meta property="dcterms:modified">2017-01-21T01:10:53Z</meta> \
      <meta content="fanfic-downloader 0.0.1" name="generator"/> \
      <dc:identifier id="id">' + story_id + '</dc:identifier> \
      <dc:creator id="creator">' + header["author"] + '</dc:creator> \
      <dc:title>' + header["title"] + '</dc:title> \
    </metadata><manifest> \
	  <item href="main.css" id="doc_style" media-type="text/css"/> \
	  <item href="intro.xhtml" id="chapter_0" media-type="application/xhtml+xml"/> \
	';
	for(var i = 0; i < num_chapters; i++){
		content_opf += '<item href="chapter_' + (i + 1).toString() + '.xhtml" id="chapter_' + (i + 1).toString() + '" media-type="application/xhtml+xml"/>';
		content_opf += "\n";
	}
	content_opf += '<item href="toc.ncx" id="ncx" media-type="application/x-dtbncx+xml"/> \
	  <item href="nav.xhtml" id="nav" media-type="application/xhtml+xml" properties="nav"/> \
	  <item href="toc.xhtml" id="book_toc" media-type="application/xhtml+xml" properties="nav"/> \
	</manifest> \
	<spine toc="ncx"> \
	  <itemref idref="chapter_0"/> \
	  <itemref idref="book_toc"/> \
	';
	for(var i = 0; i < num_chapters; i++){
		content_opf += '<itemref idref="chapter_' + (i + 1).toString() + '"/>';
		content_opf += "\n";
	}
	content_opf += "</spine></package>";
	EPUB.push(["content.opf", content_opf]);

	// Generate toc.ncx.
	var toc_ncx = ' \
	<?xml version=\'1.0\' encoding=\'utf-8\'?> \
	<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"> \
	<head> \
	  <meta content="' + story_id + '" name="dtb:uid"/> \
	  <meta content="0" name="dtb:depth"/> \
	  <meta content="0" name="dtb:totalPageCount"/> \
	  <meta content="0" name="dtb:maxPageNumber"/> \
	</head><docTitle><text>' + header["title"] + '</text></docTitle> \
	<navMap> \
      <navPoint id="intro"> \
        <navLabel> \
          <text>Introduction</text> \
        </navLabel> \
        <content src="intro.xhtml"/> \
      </navPoint> \
      <navPoint id="sep_0"> \
        <navLabel> \
          <text>Chapters</text> \
        </navLabel> \
	    <content src="chapter_1.xhtml"/> \
	';
	for(var i = 0; i < num_chapters; i++){
		var chapter_on = i + 1;
		toc_ncx += '<navPoint id="chapter_' + chapter_on.toString() + '"> \
          <navLabel> \
            <text>' + header["chapter_titles"][i] + '</text> \
          </navLabel> \
          <content src="chapter_' + chapter_on.toString() + '.xhtml"/> \
        </navPoint> \
		';
	}
	toc_ncx += "</navPoint></navMap></ncx>";
	EPUB.push(["toc.ncx", toc_ncx]);

	// Generate the introduction, table of contents, and navigation XHTML pages. //
	// Generate the introduction.
	var intro_xhtml = '<?xml version=\'1.0\' encoding=\'utf-8\'?> \
	<!DOCTYPE html> \
	<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#" lang="en" xml:lang="en"> \
	  <head> \
	    <title>Introduction</title> \
	    <link href="main.css" type="text/css" rel="stylesheet"/> \
	  </head> \
	  <body> \
	    <h1>' + header["title"] + '</h1> \
	    <p> \
	      <b>By: ' + header["author"] + '</b> \
	    </p> \
	    <p>' + header["summary"] + '</p> \
	  </body> \
	</html> \
	';
	EPUB.push(["intro.xhtml", intro_xhtml]);

	// Generate the table of contents and navigation page.
	var toc_xhtml = '<?xml version=\'1.0\' encoding=\'utf-8\'?> \
	<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en"> \
	  <head> \
	    <title>' + header["title"] + '</title> \
	  </head> \
	  <body> \
	    <nav epub:type="toc" id="id"> \
	      <h2>' + header["title"] + '</h2> \
	      <ol> \
	        <li> \
	          <a href="intro.xhtml">Introduction</a> \
	        </li> \
	        <li> \
	          <span>Chapters</span> \
	          <ol> \
	';
	for(var i = 0; i < num_chapters; i++){
		toc_xhtml += '<li><a href="chapter_' + (i + 1) + '.xhtml">' + header["chapter_titles"][i] + '</a></li>';
	}
	toc_xhtml += '</ol> \
	  </li> \
	</ol> \
	</nav> \
	</body> \
	</html> \
	';
	EPUB.push(["toc.xhtml", toc_xhtml]);
	EPUB.push(["nav.xhtml", toc_xhtml]);

	// Generate the CSS.
	var main_css = '';
	EPUB.push(["main.css", main_css]);

	// Generate the META-INF directory. //
	var META_INF = [];
	var container_xml = '<?xml version=\'1.0\' encoding=\'utf-8\'?> \
	<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"> \
	  <rootfiles> \
	    <rootfile media-type="application/oebps-package+xml" full-path="EPUB/content.opf"/> \
	  </rootfiles> \
	</container> \
	';
	META_INF.push(["container.xml", container_xml]);

	// Generate the zip file now. //
	// Initialize the filesystem.
	var fs = new zip.fs.FS();

	// Create the zip blob.
	var jzip = new JSZip();
	var epub_folder = jzip.folder("EPUB");
	for(var i = 0; i < EPUB.length; i++){
		var on = EPUB[i];
		epub_folder.file(on[0], on[1]);
	}
	var meta_inf_folder = jzip.folder("META-INF");
	for(var i = 0; i < META_INF.length; i++){
		var on = META_INF[i];
		meta_inf_folder.file(on[0], on[1]);
	}
	jzip.file("mimetype", "application/epub+zip");
	var guid = function() {
		// From http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript.
		function s4() {
			return Math.floor((1 + Math.random()) * 0x10000)
			.toString(16)
			.substring(1);
		}
		return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
	};
	jzip.generateAsync({type:"blob"}).then(function(blob){
		/*
		// Update interface.
		postMessage(["start_stage_3", ""]);

		// Create a file reference.
		var storageRef = firebase.storage().ref().child("fanfics");
		var dirRef = storageRef.child(guid());
		var filename = header["author"] + " - " + header["title"] + ".epub";
		var fileRef = dirRef.child(filename);

		// Create a database entry.
		var newPostKey = firebase.database().ref().child('fanfics').push().key;
		var updates = {};
		updates['/fanfics/' + newPostKey] = {
			"id": newPostKey,
			"timestamp": Date.now(),
			"path": fileRef.fullPath
		};
		firebase.database().ref().update(updates);

		// Start upload task.
		var uploadTask = fileRef.put(blob);
		uploadTask.on('state_changed', function(snapshot) {
			var progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
			postMessage(["upload_progress_update", progress]);
		}, function(error) {
			postMessage(["error", error]);
		}, function() {
			postMessage(["success"]);
			setTimeout(function() {
				postMessage(["download_url", uploadTask.snapshot.downloadURL]);
				setTimeout(function() {
					// Get a list of old file entries and delete them and their corresponding entries.
					var timeout_mins = 15.0;
					var oldFilesList = firebase.database()
						.ref("/fanfics")
						.orderByChild("timestamp")
						.endAt(Date.now() - (timeout_mins * 60e3))
						.on("value", function(snapshot) {
							var val = snapshot.val() || [];
							//console.log(val);
							var storageRef = firebase.storage().ref();
							for(var key in val){
								var on = val[key];
								//console.log(val[key]);
								var deleteRef = storageRef.child(on.path);
								deleteRef.delete()
									.then(function() {
										console.log("Deleted old file at path:", on.path);
										firebase.database().ref().child("/fanfics/" + key).remove();
									})
									.catch(function(error) {
										console.log("Could not delete old file at path:", on.path, error);
										firebase.database().ref().child("/fanfics/" + key).remove(); // remove entry anyway
									})
								;
							}
						})
					;
				}, 100);
			}, 150);
		});
		*/

		// Export the file to a data URI and pass it to the front-end.
		/*
		fs.importBlob(blob, function() {
			fs.exportData64URI(function(data_url) {
				postMessage(["success"]);
				setTimeout(function() {
					postMessage(["download_data_url", URL.createObjectURL(blob)]);
				}, 150);
			});
		});
		*/
		/*
		blobToDataURL(blob, function(data_url){
			postMessage(["success"]);
			setTimeout(function() {
				postMessage(["download_data_url", data_url]);
			}, 150);
		});
		*/
		var reader = new FileReader();
		reader.readAsDataURL(blob);
		reader.onloadend = function() {
			var b64data = reader.result;
			var href = "data:application/epub+zip" + b64data.slice(b64data.search(/[;]/));
			postMessage(["success"]);
			postMessage(["download_url", href]);
		}
	});
};

// Enable CORS proxy
(function() {
    var cors_api_host = 'cors-anywhere.herokuapp.com';
    var cors_api_url = 'https://' + cors_api_host + '/';
    var slice = [].slice;
    // var origin = window.location.protocol + '//' + window.location.host;
    var origin = "";
    var open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
        var args = slice.call(arguments);
        var targetOrigin = /^https?:\/\/([^\/]+)/i.exec(args[1]);
        if (targetOrigin && targetOrigin[0].toLowerCase() !== origin && targetOrigin[1] !== cors_api_host) {
            args[1] = cors_api_url + args[1];
        }
        return open.apply(this, args);
    };
})();

// var CROSS_ORIGIN_PROXY = "https://cors-fanfic-proxy.herokuapp.com/";//"https://crossorigin.me/";
var CROSS_ORIGIN_PROXY = "";

function escapeHtml(unsafe) {
	// From http://stackoverflow.com/questions/6234773/can-i-escape-html-special-chars-in-javascript.
    return unsafe
         .replace(/&/g, "&amp;")
         //.replace(/</g, "&lt;")
         //.replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;")
         .replace("/<([a-z][a-z0-9]*)[^>]*?(\/?)>/i", function(match, p1, p2) {
         	return `<${p1}${p2}>`;
         });
	;
}

function purifyHtml(html){
	html = html.replace(/<[^>]+>/g, function(w) {
		var myarray = w.split(" ");
		for (var i=0; i < myarray.length; i++) {
			// replace element name
			myarray[i] = myarray[i].replace(/<\/?.+/, function(x) { return x.toLowerCase() });
			// replace attribute names
			myarray[i] = myarray[i].replace(/[^=]+=/, function(y) { return y.toLowerCase() });
		}
		w = myarray.join(" ");
		return w;
	});
	html = html.replace("/<([a-z][a-z0-9]*)[^>]*?(\/?)>/i", function(match, p1, p2) {
		return `<${p1}${p2}>`;
	}); // strip all tag attributes
	return XHTMLPurifier.purify(html);
}

// Downloader for (m.)fanfiction.net.
handle_ffnet = function(parsed){
	// Extract story ID from URL.
	postStatus("Parsing...");
	var path = parsed.pathname;
	if(path.indexOf("/s/") != 0 || path.length <= 3) return postError("Invalid fanfiction.net story URL!");
	path = path.slice(3);
	var end_slice_idx = path.indexOf("/");
	if(end_slice_idx < 5) return postError("Invalid fanfiction.net story URL!");
	var story_id = path.slice(0, end_slice_idx);
	console.log("Story ID: %s", story_id);

	// Download description.
	postStatus("Downloading story info...");
	var info_url = CROSS_ORIGIN_PROXY + "https://www.fanfiction.net/s/" + story_id;
	var header = {};
	var chapter_texts = [];
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if(this.readyState == 4 && this.status == 200) {
			var data = this.responseText;
			// console.log(data);

			// Scrape the html for story information.
			var body = data;
			header["title"] = escapeHtml(getBetween(body, "<b class='xcontrast_txt'>", "</b>"));
			body = body.slice(body.indexOf("<a class='xcontrast_txt' href='/u/") + ("<a class='xcontrast_txt' href='/u/").length);
			header["author"] = escapeHtml(getBetween(body, "'>", "</a>"));
			body = body.slice(body.indexOf("<div") + 4);
			header["summary"] = escapeHtml(getBetween(body, "'>", "</div>"));
			body = data;
			header["chapter_titles"] = [];

			// Look for any chapter titles, and if none found, assume it's a one-shot.
			var ch_select = getBetween(body, "id=chap_select", "<button");
			var all_titles = ch_select.split("<option");
			//console.log(all_titles);
			for(var i = 1; i < all_titles.length; i++){
				var val = all_titles[i].slice(all_titles[i].indexOf(">") + 1);
				if(val.indexOf("</select") !== -1){
					val = val.split("</select")[0];
				}
				header["chapter_titles"].push(escapeHtml(val));
			}
			if(header["chapter_titles"].length == 0){
				// If no chapter titles found, assume only one chapter in story.
				header["chapter_titles"] = [header["title"]];
			} else {
				var numbered = true;
				for(var i = 0; i < header["chapter_titles"].length; i++){
					var ch_on = header["chapter_titles"][i];
					if(!ch_on.includes(".")){
						numbered = false;
						break;
					}
				}
				if(numbered){
					for(var i = 0; i < header["chapter_titles"].length; i++){
						var ch_on = header["chapter_titles"][i];;
						header["chapter_titles"][i] = ch_on.split(".")[1].trim();
					}
				}
			}
			console.log(header);

			// Save chapter text.
			// ch_text = get_between(body, "id='storytext'>", "</div>")

			chapter_texts.push(purifyHtml(getBetween(body, "id='storytext'>", "</div>")));
		}
	};
	xhttp.open("GET", info_url, /*async=*/false);
	xhttp.setRequestHeader("User-Agent", "Mozilla/5.0 (Windows NT 6.2; WOW64; rv:28.0) Gecko/20100101 Firefox/28.0)");
	xhttp.send();

	// Perform a sanity check.
	if(header["title"].length == 0 || header["author"].length == 0){
		return postError("Invalid fanfiction.net story URL!");
	}
	postMessage([
		"story_info",
		header
	])

	// Download the rest of the chapter's texts.
	var num_chapters = header["chapter_titles"].length;
	for(var i = 1; i < num_chapters; i++){
		var chapter_on = i + 1;
		var chapter_url = CROSS_ORIGIN_PROXY + "https://www.fanfiction.net/s/" + story_id + "/" + chapter_on;
		postMessage([
			"progress_update",
			(chapter_on / num_chapters) * 100.0, // percent done
			chapter_on
		])

		// Set up parsing function.
		xhttp.onreadystatechange = function() {
			if(this.readyState == 4 && this.status == 200) {
				var data = this.responseText;
				chapter_texts.push(purifyHtml(getBetween(data, "id='storytext'>", "</div>")));
				console.log("Downloaded page of length %d and chapter of length %d.", data.length,
				chapter_texts[chapter_texts.length - 1].length);
			}
		};
		xhttp.open("GET", chapter_url, /*async=*/false);
		xhttp.setRequestHeader("User-Agent", "Mozilla/5.0 (Windows NT 6.2; WOW64; rv:28.0) Gecko/20100101 Firefox/28.0)");
		xhttp.send();
	}

	// Return data.
	return [header, chapter_texts, "fanfiction-" + story_id.toString()];
}


























