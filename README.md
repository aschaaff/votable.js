# votable.js

Javascript parser for VOTable

votable.js is a Javascript parser to handle the VOTable format.

The VOTable format is used in many astronomical services and tools.

VOTable is a Recommendation from the IVOA (International Virtual Observatory Alliance).

Link to VOTable: http://www.ivoa.net/documents/VOTable/

This work started in September 2014.

The parser was initially developped by Thomas Rolling (UTBM) in the frame of an internship and followed by André Schaaff and Gilles Landais.

This parser is also designed to manipulate data in base64 format.

It has been tested in various situations but if you encounter a problem or if you have suggestions concerning corrections and / or evolutions you may send a mail to cds-question@unistra.fr with the title votable.js

Example of implementation in VizieR: http://vizier.u-strasbg.fr/vizier/welcome/
where votable.js is used to load the metadata and to format it on the client side

## Dependency

votable.js has a dependency on jQuery.

## Basic code usage

    var p = new Parser();
    
    var success = function() {
        p.SelectResource(0); // select 1st resource in document
        p.SelectTable(0); // select 1st table in resource
        var data = p.GetData();
        console.log("Value of first field in first row: ", data.TR[0].TD[0]);
    };
    var error = function() {
        alert('Something went wrong');
    };
    
    p.setCallbackFunction(success, error);
    p.load('http://vizier.u-strasbg.fr/viz-bin/votable/-A?-source=I/311/hip2&-c=M%2045&-out.max=999&-c.rd=5');
