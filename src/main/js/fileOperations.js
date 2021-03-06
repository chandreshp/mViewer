/*
 * Copyright (c) 2011 Imaginea Technologies Private Ltd.
 * Hyderabad, India
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
YUI({
	filter: 'raw'
}).use("loading-panel", "yes-no-dialog", "alert-dialog", "upload-dialog", "io-base", "json-parse", "node-event-simulate", "node", "event-delegate", "stylize", "json-stringify", "utility", "event-key", "event-focus", "node-focusmanager", function(Y) {
	YUI.namespace('com.imaginea.mongoV');
	var MV = YUI.com.imaginea.mongoV, sm = MV.StateManager;
	MV.treebleData = {};
	
	// The Collection context menu object
	var gridFSContextMenu = new YAHOO.widget.ContextMenu("gridFSContextMenuID", {
		trigger: "bucketNames",
		itemData: ["Add File(s)", "Drop Bucket", "Statistics"],
		lazyload: true
	});

	gridFSContextMenu.subscribe("render", function(eventType, args) {
		this.subscribe("click", handleContextMenu);
	});

	/**
	 * The function handles event on the context menu for the collection
	 * @param eventType The event type
	 * @param args the arguments containing information about which menu item was clicked
	 */
	function handleContextMenu(eventType, args) {
		var menuItem = args[1],	// The MenuItem that was clicked
				form, showErrorMessage;
		sm.setCurrentBucket(this.contextEventTarget.innerHTML);
		MV.toggleClass(sm.currentBucketAsNode(), Y.all("#bucketNames li"));
		switch (menuItem.index) {
			case 0:
				// Add File
				form = "addFileDialog";
				showErrorMessage = function(responseObject) {
					MV.showAlertDialog("File upload failed! Please check if your app server is running and then refresh the page.", MV.warnIcon);
					Y.log("File upload failed. Response Status: [0]".format(responseObject.statusText), "error");
				};				
				MV.showUploadDialog(form);
				break;
			case 1:
				// Delete
				MV.showYesNoDialog("Do you really want to drop all files in this bucket - " + Y.one("#currentBucket").get("value") + "?", sendDropBucketRequest, function() {
					this.hide();
				});
				break;
			case 2:
				// click to view details
				MV.hideQueryForm();
				MV.createDatatable(MV.URLMap.bucketStatistics(".files"), Y.one("#currentBucket").get("value"));
				MV.createDatatable(MV.URLMap.bucketStatistics(".chunks"), Y.one("#currentBucket").get("value"));
				break;
		}
	}

	/**
	 * Handler for drop bucket request. 
	 * @param responseObject The response Object
	 */
	function sendDropBucketRequest() {
		//"this" refers to the Yes/No dialog box
		this.hide();
		Y.log("Preparing to send request to drop bucket", "info");
		var request = Y.io(MV.URLMap.dropBucket(), {
			on: {
				success: function(ioId, responseObj) {
					var parsedResponse = Y.JSON.parse(responseObj.responseText);
					response = parsedResponse.response.result;
					if (response !== undefined) {
						MV.showAlertDialog(response, MV.infoIcon);
						Y.log(response, "info");
						Y.one("#" + Y.one("#currentBucket").get("value").replace(/ /g, '_')).simulate("click");
					} else {
						var error = parsedResponse.response.error;
						MV.showAlertDialog("Could not delete all files : [0]".format(MV.errorCodeMap[error.code]), MV.warnIcon);
						Y.log("Could not delete all files, Error message: [0], Error Code: [1]".format(error.message, error.code), "error");
					}
				},
				failure: function(ioId, responseObj) {
					Y.log("Could not delete the file. Status text: ".format(Y.one("#currentBucket").get("value"), responseObj.statusText), "error");
					MV.showAlertDialog("Could not drop the file! Please check if your app server is running and try again. Status Text: [1]".format(responseObj.statusText), MV.warnIcon);
				}
			}
		});
	}

	/**
	 * The function is an event handler to show the files whenever a bucket name is clicked
	 * @param {object} e It is an event object
	 *
	 */
	var showTabView = function(e) {
		MV.toggleClass(e.currentTarget, Y.all("#bucketNames li"));
		sm.setCurrentBucket(e.currentTarget.getContent());
		MV.openFileEvent.unsubscribeAll();
		MV.openFileEvent.subscribe(getFile);
		MV.deleteFileEvent.unsubscribeAll();
		MV.deleteFileEvent.subscribe(deleteFile);
		MV.mainBody.empty(true);
		initDataSource();

		var tabView = new YAHOO.widget.TabView();
		tabView.addTab(new YAHOO.widget.Tab({
			label: 'Tree Table',
			active: true,
			content: ' <div id="table"></div><div id="table-pagination"></div> '
		}));
		tabView.addTab(new YAHOO.widget.Tab({
			label: 'JSON',
			cacheData: true
		}));

		/**
		 * The function creates and XHR data source which will get all the files.
		 * A data source is created so that we don't have to send separate requests to load
		 * the JSON view and the Treeble view
		 *
		 */
		function initDataSource() {
			MV.data = new YAHOO.util.XHRDataSource(MV.URLMap.getFiles(), {
				responseType: YAHOO.util.XHRDataSource.TYPE_JSON,
				responseSchema: {
					resultsList: "response.result",
					metaFields: {
						startIndex: 'first_index',
						recordsReturned: 'records_returned',
						totalRecords: 'total_records'
					}
				}
			});

			MV.hideQueryForm();
			MV.showLoadingPanel("Loading Files...")
			MV.data.sendRequest("", {
				success: showFiles,
				failure: function(request, responseObject) {
					MV.hideLoadingPanel();
					MV.showAlertDialog("Failed: Files could not be loaded", MV.warnIcon);
					Y.log("Files could not be loaded. Response: [0]".format(responseObject.responseText), "error");
				},
				scope: tabView
			});
		}

		/**
		 * The function is the success handler for the request file call.
		 * It calls function to write on the JSON tab and to create the treeble structure
		 * from the response data
		 * @param {Object} request The request Object
		 * @param {Object} responseObject The response object containing the response of the get files request
		 *
		 */
		function showFiles(request, responseObject) {
			Y.log("Preparing the treeTable data", "info");
			var treebleData = MV.getTreebleDataForFiles(responseObject);
			var treeble = MV.getTreeble(treebleData, "file");
			loadAndSubscribe(treeble);
			Y.log("Tree table view loaded", "info");
			Y.log("Preparing to write on JSON tab", "info");
			writeOnJSONTab(responseObject.results);
			sm.publish(sm.events.queryFired);
			MV.hideLoadingPanel();
		}

		/**
		 * The function loads the treeble view and subscibes it to the mouse over event.
		 * When the mouse over over the rows the complete row is highlighted
		 * @param treeble the treeble structure to be loaded
		 */
		function loadAndSubscribe(treeble) {
			treeble.load();
			treeble.subscribe("rowMouseoverEvent", treeble.onEventHighlightRow);
			treeble.subscribe("rowMouseoutEvent", treeble.onEventUnhighlightRow);			
		}

		/**
		 * The function creates the json view and adds the edit,delete,save and cancel buttons for each file
		 * @param response The response Object containing all the files
		 */
		function writeOnJSONTab(response) {
			var jsonView = "<div class='buffer jsonBuffer navigable navigateTable' id='jsonBuffer'>";
			var i;
			var trTemplate = ["<tr id='file[0]'>",
				"  <td>",
				"      <pre> <textarea id='ta[1]' class='disabled non-navigable' disabled='disabled' cols='75'>[2]</textarea></pre>",
				"  </td>",
				"  <td>",
				"  <button id='open[3]'class='bttn non-navigable'>open</button>",
				"   <button id='download[4]'class='bttn non-navigable'>download</button>",
				"   <button id='delete[5]'class='bttn non-navigable'>delete</button>",
				"   <br/>",
				"  </td>",
				"</tr>"].join('\n');
			jsonView += "<table class='jsonTable'><tbody>";

			for (i = 0; i < response.length; i++) {
				jsonView += trTemplate.format(i, i, Y.JSON.stringify(response[i], null, 4), i, i, i);
			}
			if (i === 0) {
				jsonView = jsonView + "No files to be displayed";
			}
			jsonView = jsonView + "</tbody></table></div>";
			tabView.getTab(1).setAttributes({
				content: jsonView
			}, false);
			for (i = 0; i < response.length; i++) {
				Y.on("click", function(e) {
					MV.openFileEvent.fire({eventObj : e, isDownload: false});
				}, "#open" + i);
				Y.on("click", function(e) {
					MV.openFileEvent.fire({eventObj : e, isDownload: true});
				}, "#download" + i);
				Y.on("click", function(e) {
					MV.deleteFileEvent.fire({eventObj : e});
				}, "#delete" + i);
			}
			for (i = 0; i < response.length; i++) {
				fitToContent(500, document.getElementById("ta" + i));
			}
			var trSelectionClass = 'selected';
			// add click listener to select and deselect rows.
			Y.all('.jsonTable tr').on("click", function(eventObject) {
				var currentTR = eventObject.currentTarget;
				var alreadySelected = currentTR.hasClass(trSelectionClass);

				Y.all('.jsonTable tr').each(function(item) {
					item.removeClass(trSelectionClass);
				});

				if (!alreadySelected) {
					currentTR.addClass(trSelectionClass);
					var openBtn = currentTR.one('button.openbtn');
					if (openBtn) {
						openBtn.focus();
					}
				}
			});
			Y.on('blur', function(eventObject) {
				var resetAll = true;
				// FIXME ugly hack for avoiding blur when scroll happens
				if (sm.isNavigationSideEffect()) {
					resetAll = false;
				}
				if (resetAll) {
					Y.all('tr.selected').each(function(item) {
						item.removeClass(trSelectionClass);
					});
				}
			}, 'div.jsonBuffer');
			Y.log("The files written on the JSON tab", "debug");
		}
		
		/**
		 * The function is an event handler to handle the open button click.
		 * It opens the file in new tab
		 * @param eventObject The event Object
		 */
		function getFile(type, args) {
			var targetNode = args[0].eventObj.currentTarget;
			var index = getButtonIndex(targetNode);
			var doc = Y.one('#file' + index).one("pre").one("textarea").get("value");
			parsedDoc = Y.JSON.parse(doc);
			if (args[0].isDownload == true) {
				if(!MV._downloadIframe){
					MV._downloadIframe = document.createElement("iframe");
					MV._downloadIframe.style.display = "none";
					document.body.appendChild(MV._downloadIframe);
				}
				MV._downloadIframe.src = MV.URLMap.getFile(parsedDoc._id.$oid, true);
			} else {
				window.open(MV.URLMap.getFile(parsedDoc._id.$oid, false));
			}
		}

		/**
		 * The function is an event handler to handle the delete button click.
		 * It sends request to delete the file
		 * @param eventObject The event Object
		 */
		function deleteFile(type, args) {
			var sendDeleteFileRequest = function() {
				var targetNode = args[0].eventObj.currentTarget;
				var index = getButtonIndex(targetNode);
				var doc = Y.one('#file' + index).one("pre").one("textarea").get("value");
				parsedDoc = Y.JSON.parse(doc);
				var id = parsedDoc._id.$oid;
				var request = Y.io(MV.URLMap.deleteFile(id), {
					on: {
						success: function(ioId, responseObj) {
							var parsedResponse = Y.JSON.parse(responseObj.responseText);
							response = parsedResponse.response.result;
							if (response !== undefined) {
								MV.showAlertDialog("File deleted", MV.infoIcon);
								Y.log("File with _id= [0] deleted. Response: [1]".format(id, response), "info");
								//Y.one('#file' + index).remove();
								Y.one("#" + Y.one("#currentBucket").get("value").replace(/ /g, '_')).simulate("click");
							} else {
								var error = parsedResponse.response.error;
								MV.showAlertDialog("Could not delete the file with _id [0]. [1]".format(id, MV.errorCodeMap[error.code]), MV.warnIcon);
								Y.log("Could not delete the file with _id =  [0], Error message: [1], Error Code: [2]".format(id, error.message, error.code), "error");
							}
						},
						failure: function(ioId, responseObj) {
							Y.log("Could not delete the file. Status text: ".format(Y.one("#currentBucket").get("value"), responseObj.statusText), "error");
							MV.showAlertDialog("Could not drop the file! Please check if your app server is running and try again. Status Text: [1]".format(responseObj.statusText), MV.warnIcon);
						}
					}
				});
				this.hide();
			};

			MV.showYesNoDialog("Do you really want to drop the file ?", sendDeleteFileRequest, function() {
				this.hide();
			});
		}

		/**
		 * Sets the size of the text area according to the content in the text area.
		 * @param maxHeight The maximum height if the text area
		 * @param text The text of the text area
		 */
		function fitToContent(maxHeight, text) {
			if (text) {
				var adjustedHeight = text.clientHeight;
				if (!maxHeight || maxHeight > adjustedHeight) {
					adjustedHeight = Math.max(text.scrollHeight, adjustedHeight);
					if (maxHeight) {
						adjustedHeight = Math.min(maxHeight, adjustedHeight);
					}
					if (adjustedHeight > text.clientHeight) {
						text.style.height = adjustedHeight + "px";
					}
				}
			}
		}

		function getButtonIndex(targetNode) {
			var btnID = targetNode.get("id");
			var match = btnID.match(/\d+/);
			return (parseInt(match[0], 10));
		}

		MV.header.set("innerHTML", "Contents of " + Y.one("#currentBucket").get("value"));
		tabView.appendTo(MV.mainBody.get('id'));
	};
	Y.delegate("click", showTabView, "#bucketNames", "li");
});