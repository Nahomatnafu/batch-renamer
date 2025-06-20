// --- JSON Polyfill for ExtendScript ---
if (typeof JSON === "undefined") {
  JSON = {};
}
if (typeof JSON.stringify !== "function") {
  JSON.stringify = function (obj) {
    var t = typeof obj;
    if (t !== "object" || obj === null) {
      if (t === "string") obj = '"' + obj + '"';
      return String(obj);
    } else {
      var json = [],
        isArray = obj && obj.constructor === Array;
      for (var n in obj) {
        var v = obj[n];
        t = typeof v;
        if (t === "string") v = '"' + v + '"';
        else if (t === "object" && v !== null) v = JSON.stringify(v);
        json.push((isArray ? "" : '"' + n + '":') + String(v));
      }
      return (isArray ? "[" : "{") + String(json) + (isArray ? "]" : "}");
    }
  };
}
if (typeof JSON.parse !== "function") {
  JSON.parse = function (sJSON) {
    return eval("(" + sJSON + ")");
  };
}

// --- Batch Rename Function ---
function renameClips(argsString) {
  var args = JSON.parse(argsString);
  var renamed = 0;
  var scanned = [];

  // Helper function to pad numbers with leading zeros based on the original format
  function padNumberWithFormat(number, format) {
    // Count leading zeros in the format string
    var leadingZeros = 0;
    for (var i = 0; i < format.length; i++) {
      if (format.charAt(i) === '0') {
        leadingZeros++;
      } else {
        break;
      }
    }
    
    // If there are no leading zeros, just return the number as string
    if (leadingZeros === 0) {
      return number.toString();
    }
    
    // Otherwise pad to the total length of the format
    var padded = number.toString();
    var totalLength = format.length;
    
    while (padded.length < totalLength) {
      padded = "0" + padded;
    }
    
    return padded;
  }

  // Helper function to rename an item
  function renameItem(item, args, scanned) {
    var original = item.name;
    var newName = original;
    
    if (args.mode === "front" && args.prefix) {
      newName = args.prefix + original;
    } else if (args.mode === "end" && args.suffix) {
      newName = original + args.suffix;
    } else if (args.mode === "replace" && args.findText) {
      newName = original.split(args.findText).join(args.replaceText);
    } else if (args.mode === "remove" && args.removeChars) {
      // Only remove from the end of the filename
      if (original.endsWith(args.removeChars)) {
        newName = original.substring(0, original.length - args.removeChars.length);
      }
    } else if (args.mode === "removeFront" && args.removeFrontChars) {
      // Only remove from the front of the filename
      if (original.indexOf(args.removeFrontChars) === 0) {
        newName = original.substring(args.removeFrontChars.length);
      }
    } else if (args.mode === "replaceWithNumbers" && args.numberFind) {
      // Replace text with sequential numbers
      var currentNumber = parseInt(args.numberStartAt);
      var paddedNumber = padNumberWithFormat(currentNumber, args.numberStartAt);
      
      // If the item contains the text to find, replace it with the number
      if (original.indexOf(args.numberFind) !== -1) {
        newName = original.split(args.numberFind).join(paddedNumber);
        // Increment the counter for the next item
        args.numberStartAt = (currentNumber + 1).toString();
      }
    } else if (args.mode === "addNumbersToEnd") {
      // Add sequential numbers to the end of the name
      var currentNumber = parseInt(args.endNumberStartAt);
      var paddedNumber = padNumberWithFormat(currentNumber, args.endNumberStartAt);
      
      newName = original + paddedNumber;
      
      // Increment the counter for the next item but preserve the original format
      // Store the incremented number as a string with the same format
      var nextNumber = currentNumber + 1;
      args.endNumberStartAt = padNumberWithFormat(nextNumber, args.endNumberStartAt);
    }
    
    if (newName !== original) {
      try {
        item.name = newName;
        renamed++;
        scanned.push("✔ " + original + " → " + newName);
      } catch (e) {
        scanned.push("❌ Failed: " + original + " → " + e.message);
      }
    }
  }

  var project = app.project;
  var root = project.rootItem;
  
  // Get the selected items if filter is set to selected
  var selectedItems = [];
  if (args.filters.selected) {
    try {
      // Get currently selected items in the project panel
      var viewID = app.getProjectViewIDs()[0]; // Get the first view ID
      selectedItems = app.getProjectViewSelection(viewID);
      
      // Sort selected items to process them in the correct order (top to bottom)
      // This is important for sequential numbering
      if (selectedItems && selectedItems.length > 0) {
        // We can't directly sort the array returned by the API, so we'll create a new one
        var sortedItems = [];
        for (var i = 0; i < selectedItems.length; i++) {
          sortedItems.push(selectedItems[i]);
        }
      }
      
      // Use the sorted items for processing
      selectedItems = sortedItems || selectedItems;
    } catch (e) {
      alert("Error getting selected items: " + e.toString());
    }
  }
  
  // Process items based on filters
  processItems(root, args, selectedItems, scanned);
  
  alert("✅ Renamed " + renamed + " item(s):\n\n" + scanned.join("\n"));
  
  // Helper function to process items recursively
  function processItems(parentItem, args, selectedItems, scanned) {
    if (!parentItem || !parentItem.children) return;
    
    // If we're working with selected items, process them directly in selection order
    if (args.filters.selected && selectedItems && selectedItems.length > 0) {
      for (var j = 0; j < selectedItems.length; j++) {
        var selectedItem = selectedItems[j];
        if (!selectedItem) continue;
        
        // Check if this item should be processed based on type filters
        var itemType = getItemType(selectedItem);
        var shouldProcess = true;
        
        if (itemType === "sequence" && !args.types.sequences) shouldProcess = false;
        if (itemType === "clip" && !args.types.clips) shouldProcess = false;
        if (itemType === "bin" && !args.types.bins) shouldProcess = false;
        if (itemType === "misc" && !args.types.misc) shouldProcess = false;
        
        // Process the item if it passes all filters
        if (shouldProcess) {
          renameItem(selectedItem, args, scanned);
        }
      }
      return; // We've processed all selected items, no need to continue
    }
    
    // Process all children if not using selection filter
    for (var i = 0; i < parentItem.children.numItems; i++) {
      var item = parentItem.children[i];
      if (!item) continue;
      
      // Check if this item should be processed based on filters
      var shouldProcess = true;
      
      // Filter by item type
      var itemType = getItemType(item);
      if (itemType === "sequence" && !args.types.sequences) shouldProcess = false;
      if (itemType === "clip" && !args.types.clips) shouldProcess = false;
      if (itemType === "bin" && !args.types.bins) shouldProcess = false;
      if (itemType === "misc" && !args.types.misc) shouldProcess = false;
      
      // Process the item if it passes all filters
      if (shouldProcess) {
        renameItem(item, args, scanned);
      }
      
      // Recursively process bins to find all items
      if (item.type === 2) {
        processItems(item, args, selectedItems, scanned);
      }
    }
  }
  
  // Helper function to get item type category
  function getItemType(item) {
    if (!item) return "misc";
    
    if (item.type === 1) return "clip"; // Footage item
    if (item.type === 2) return "bin";  // Bin
    if (item.isSequence()) return "sequence"; // Sequence
    
    return "misc"; // Other types
  }
}

// Add String.prototype.endsWith if it doesn't exist (for older ExtendScript)
if (!String.prototype.endsWith) {
  String.prototype.endsWith = function(searchString, position) {
    var subjectString = this.toString();
    if (typeof position !== 'number' || !isFinite(position) 
        || Math.floor(position) !== position || position > subjectString.length) {
      position = subjectString.length;
    }
    position -= searchString.length;
    var lastIndex = subjectString.indexOf(searchString, position);
    return lastIndex !== -1 && lastIndex === position;
  };
}

// Add this helper function for cross-platform path handling
function normalizePath(path) {
  var osInfo = $.os.indexOf('Windows') > -1 ? 'Windows' : 'Mac';
  if (osInfo === 'Windows') {
    return path.replace(/\//g, '\\');
  } else {
    return path.replace(/\\/g, '/');
  }
}

// Use this function when dealing with file paths in your code

