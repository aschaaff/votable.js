/*         
        Copyright 2014 - UDS/CNRS
        The votables.js and its additional files (examples, etc.) are distributed
         under the terms of the GNU General Public License version 3.

        This file is part of votables.js package.

        votables.js is free software: you can redistribute it and/or modify
        it under the terms of the GNU General Public License as published by
        the Free Software Foundation, version 3 of the License.

        votables.js is distributed in the hope that it will be useful,
        but WITHOUT ANY WARRANTY; without even the implied warranty of
        MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
        GNU General Public License for more details.

        The GNU General Public License is available in COPYING file
        along with votables.js

        votables.js - Javascript library for the VOTable format (IVOA
        standard) parsing
        
        version 1.0

        Author: Thomas Rolling (CDS / UTBM)
        For questions concerning this work: Andre Schaaff (CDS)
*/


function Parser() {
    'use strict';

    /* Private */
    var thisParser = this;
    var xmlData = {};
    var modeDebug = true;
    var LastDate = 0; // A supprimer par la suite.
    var Selected = { resource: { i:0, xml:null, tables:0 },
                     table: { i:0, xml:null } };

    var TableData = [[]];
    var prefixe = '';
    var vot = { name: '', 
                loadEtat: 'null', // Value : success, fail, null 
                encode: '', // Value : UTF-8, BASE-64
                nbTable:  0,
                nbResource: 0,
                resource : null };
    var callbackfn = null;
    var errcallbackfn = null;

    /* Private (used by streamB64 and DecodeB64 method)*/
    var DataB64 = '';
    var BufferTabBits = '';
    var PtrStream = 0;

    /* Public */
    this.benchmark = '';
    this.jsonDoc = '';



    /***
      * Get the prefixe of the document.
      *
      * Example :
      * Extract of Votable : <vot:VOTABLE version="1.3" ...
      * Ouput : vot:
      *
      * @return : string
    ***/
    function GetPrefixe() {
        var prefixe;

        // If Webkit chrome/safari/... (no need prefixe)
        if($(xmlData).find("VOTABLE").length) {
            return '';
        } else {
            // Select all data in the document
            prefixe = $(xmlData).find("*");

            // get name of the firt tag
            prefixe = prefixe.prop("tagName");

            // Delete "VOTABLE" in the string 
            prefixe = prefixe.replace('VOTABLE', '');

            // Add backslash if string contain jquery meta-characters
            prefixe = prefixe.replace(/([ #;?%&,.+*~\':"!^$[\]()=>|\/@])/g,'\\$1');

            return prefixe;
        }
    }

    /***
      * set a Callbabck function (async ajax).
      * callback function has 1 parameter = this
      * 
      * function myfunction(parser) {
      *   ....
      * }
      * p = new Parser();
      * p.setCallbackFunction(myfunction, myfunction)
      * p.load(link, new Date().getTime());
    ***/
    this.setCallbackFunction = function(callback,errcallback) {
        thisParser.callbackfn = callback;
        thisParser.errcallback = errcallback;
    };

    /***
      * Load XML document.
      *
      * @param : String (Path to XML) 
    ***/

    this.load = function(xmlDoc) {
        var time = new Date().getTime()
        var asyncmode = false;
        if (thisParser.callbackfn != null) asyncmode = true;
        $.ajaxSetup({async: asyncmode});

        $.get(xmlDoc, function(DataXmlDoc) {
                var i = 0, benchmark;

                benchmark = new Date().getTime() - time;
                console.log('loading time : ' + benchmark + ' ms.')

                // Reset var, useful if a Votable has been loaded
                Selected.resource.i = 0;
                Selected.resource.xml = null;
                Selected.resource.tables = null;
                Selected.table.i = 0;
                Selected.table.xml = null;
                TableData = [[]];                        
                vot.encode = '';
                vot.nbTable = 0;
                vot.nbResource = 0;
                vot.resource = null;

                // Hydrate
                xmlData = DataXmlDoc;
                prefixe = GetPrefixe();
                vot.name = xmlDoc;
                vot.loadEtat = 'success';  
                vot.encode = thisParser.GetEncodage();
                vot.nbTable = thisParser.GetNbTableVotable();
                vot.resource = $(xmlData).find(prefixe + 'RESOURCE');
                vot.nbResource = vot.resource.length;

                // Prepare multidimentional array
                for(i=0; i<vot.nbResource; i++) {
                    TableData[i] = [];
                }

                if (thisParser.callbackfn != null) thisParser.callbackfn(thisParser)
        })

        .fail(function() {
                debug('Unable to load Votable. Check the path of the Votable file');                                        
                vot.loadEtat = 'fail';
                if (thisParser.errcallbackfn != null) thisParser.errcallback(thisParser)
        });
    }



    /************************************************************
    Start Base 64 function                                      *
    ************************************************************/


    /***
      * Convert Ascii code to base 64 value.
      *
      * Example :
      * Input : 104 (Ascii code of h)
      * Ouput : 33 (value of h in base 64)
      *
      * @param : int 
      * @return : int
    ***/

    function b64ToUint6(caractere) {
        var byte;

        if (caractere > 64 && caractere < 91) {  // char A-Z
            byte = caractere - 65;
        } else if (caractere > 96 && caractere < 123) { // char a-z
            byte = caractere - 71;
        } else if (caractere > 47 && caractere < 58) { // number 0-9
            byte = caractere + 4;
        } else if (caractere === 43) { // char +
            byte = 62;
        } else if (caractere === 47) { // char / 
            byte = 63;
        }

        return byte;
    }



    /***
      * Convert binary array to float 32 bits.
      *
      * Example :
      * Input : array(0, 0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0) 
      * Ouput : 0.302
      *
      * @param : array 
      * @return : float (32 bit)
    ***/

    function bin2float32(TabBits) {
        'use strict';
        var buffer, dataview, binary;

        buffer = new ArrayBuffer(4);
        dataview = new DataView(buffer);
        binary = TabBits.join(''); 
        dataview.setUint32(0, parseInt(binary, 2));

        return dataview.getFloat32(0);
    }



    /***
      * Convert binary array to double 64 bits.
      *
      * Example :
      * Input : array(0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1) 
      * Ouput : 265.083811
      *
      * @param : array 
      * @return : float (64 bit)
    ***/

    function bin2double64(TabBits) {
        'use strict';    
        var buffer, dataview, lenght, binary;

        buffer = new ArrayBuffer(8);
        dataview = new DataView(buffer);

        binary = TabBits.slice(0, 32).join('');
        dataview.setUint32(0, parseInt(binary, 2));
        binary = '';

        binary =  TabBits.slice(32, 64).join('');
        dataview.setUint32(4, parseInt(binary, 2));

        return dataview.getFloat64(0);
    }



    /***
      * Convert binary array to int 16 bits (signed).
      *
      * Example :
      * Input : array(0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1) 
      * Ouput : 21 549
      *
      * @param : array 
      * @return : int (16 bit)
    ***/

    function bin2short16(TabBits) {
        'use strict';
        var buffer, dataview, binary;

        buffer = new ArrayBuffer(2);
        dataview = new DataView(buffer);
        binary = TabBits.join(''); 
        dataview.setUint16(0, parseInt(binary, 2));

        return dataview.getInt16(0);
    }



    /***
      * Convert binary array to int 32 bits (signed).
      *
      * Example :
      * Input : array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0) 
      * Ouput : 1 049 834
      *
      * @param : array 
      * @return : int (32 bit)
    ***/

    function bin2int32(TabBits) {
        'use strict';
        var buffer, dataview, binary;

        buffer = new ArrayBuffer(4);
        dataview = new DataView(buffer);
        binary = TabBits.join(''); 
        dataview.setUint32(0, parseInt(binary, 2));

        return dataview.getInt32(0);
    }



    /***
      * Convert binary array to int 32 bits (unsigned).
      *
      * Example :
      * Input : array(0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 0) 
      * Ouput : 248 973 430
      *
      * @param : array 
      * @return : int (32 bit)
    ***/

    function bin2uint32(TabBits) {
        'use strict';
        var buffer, dataview, binary;

        buffer = new ArrayBuffer(4);
        dataview = new DataView(buffer);
        binary = TabBits.join(''); 
        dataview.setUint32(0, parseInt(binary, 2));

        return dataview.getUint32(0);
    }



    /***
      * Convert binary array to int 8 bits (unsigned : 0 - 255).
      *
      * Example :
      * Input : array(1, 0, 0, 0, 1, 1, 0, 0) 
      * Ouput : 140
      *
      * @param : array 
      * @return : int (8 bit)
    ***/

    function bin2ubyte8(TabBits) {
        'use strict';
        var buffer, dataview, binary;

        buffer = new ArrayBuffer(1);
        dataview = new DataView(buffer);
        binary = TabBits.join(''); 
        dataview.setUint8(0, parseInt(binary, 2));

        return dataview.getUint8(0);
    }



    /***
      * Convert binary array to string.
      *
      * Example :
      * Input : array(0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1) 
      * Ouput : Hi!
      *
      * @param : array 
      * @return : string (min : 1 char)
    ***/

    function bin2string(TabBits) {
        'use strict';
        var lenght, binary, i, j, str;

        lenght = ((TabBits.length) / 8);
        binary = [];
        str = '';
        j = 0;

        for(i = 0; i < lenght; i += 1) {
                binary = TabBits.slice(j, (j + 8));
                str = str.concat(String.fromCharCode(bin2ubyte8(binary)));
                binary = [];
                j += 8;
        }

        return str;
    }



    /***
      * Read base 64 data, and return binary array.
      * 
      *
      * Example : You would like to read 8 bits of the data (encoded in base 64)
      * Input : 8
      * output : array(1, 0, 0, 1, 0, 0, 0, 0) 
      *
      * @param : integer 
      * @return : array
    ***/

    function streamB64(DataSize) {
        'use strict';
        var BufferLenght, NeedBit, TabBits = [], i, nb, z;

        BufferLenght = BufferTabBits.length;
        NeedBit = Math.ceil((DataSize - BufferLenght) / 6);

        for (i = 0; i < BufferLenght; i += 1) {
            TabBits.push(BufferTabBits[i]);
        }
        BufferTabBits = []; // delete old data

        for (i = 0; i < NeedBit; i += 1) {

            if (DataB64.charCodeAt(PtrStream) == 10) { // Line Feed (Fin de ligne)
                i -= 1;
            } else {
                nb = b64ToUint6(DataB64.charCodeAt(PtrStream));

                for (z = 32; z > 0; z >>= 1) {
                    if (TabBits.length !== DataSize) {
                         TabBits.push(((nb & z) === z) ? "1" : "0");
                    } else {
                         BufferTabBits.push(((nb & z) === z) ? "1" : "0");
                    }
                }
            }
            PtrStream += 1;
        }
        return TabBits;
    }



    /***
      * Read the stream of base 64 data, and gradually decode it. 
      *
      * Output (store in var TableData) :
      * TR ==>              [Object { Object { TD=[19]}, Object { TD=[19]} ...]
      * TR[0] ==>           Object { TD=[19]}
      * TR[0].TD ==>        ["0.0763", "265.083811", "-32.254496", ...]
      * TR[0].TD[0] ==>     0.0763
      *
      * TR[x] return 1 row of data, TR[x].TD[y] return one data.
      *
      * @return (store in var TableData) : array of object (data)
    ***/

    function DecodeB64() {
        'use strict';
        var rows = {TR: []}, column = {TD: []},  DataInfo = [], findTable, findResource, PtrDataInfo = 0, TabBits = [], DataB64Length, NbField, TabDataSize, DataSize, DataType, value = '', debug = 0, i = 0, debut, fin;

        DataB64 = $(Selected.table.xml).find(prefixe + 'STREAM').text();

        DataB64Length = DataB64.length;
        DataInfo = thisParser.GetField();
        NbField = DataInfo.length;
        TabDataSize = {short: 16, int: 32, float: 32, double: 64, unsignedByte: 8};

        debut = new Date().getTime(); 

        do {
            DataType = DataInfo[PtrDataInfo].datatype;

            /* Etape 1 :  On détermine DataSize (Taille en bit de notre donnée) */
            if (DataType === 'char') {
                if (/\*/.test(DataInfo[PtrDataInfo].arraysize)) { // Si taille variable (ex: arraysize="16*")

                    TabBits = streamB64(32);
                    DataSize =  (8 * bin2uint32(TabBits));

                    if(DataSize == 0) {
                        DataType = 'NULL';   
                    }

                    TabBits = [];
                } else { // Taille fixe
                    DataSize = (8 * DataInfo[PtrDataInfo].arraysize);       
                }
            } else {
                DataSize = TabDataSize[DataType];
            }

            /* Etape 2 : Selon le type de donnée à traiter (float, string, ...), on appel la fonction adéquat*/
            if(DataType != 'NULL') {
                TabBits = streamB64(DataSize);
            }

            switch (DataType) {
                case 'short': 
                    value = bin2short16(TabBits);
                break;
                case 'int': 
                    value = bin2int32(TabBits);
                break;
                case 'float': 
                    value = bin2float32(TabBits);
                    value = value.toFixed(DataInfo[PtrDataInfo].precision); // round (arrondi)
                break;
                case 'double': 
                    value = bin2double64(TabBits);
                    value = value.toFixed(DataInfo[PtrDataInfo].precision) // round (arrondi)
                break;
                case 'unsignedByte':
                    value = bin2ubyte8(TabBits);
                break;
                case 'char':
                    value = bin2string(TabBits);
                break;
                case 'NULL': // Empty Data
                     value = 'NULL';
                break;
            }

            if(value === 'NaN' || value === 'NULL' || value === 0) {
                value = '';
            } 

            /* Etape 3 : On insère les données dans notre tableau d'objet que nous renvoyons */
            column.TD[PtrDataInfo] = value;

            if(PtrDataInfo === (NbField - 1)) {
                PtrDataInfo = 0;
                rows.TR[i] = column;
                column = {TD: []};
                i += 1;
            } else {
                PtrDataInfo += 1;
            }
        } while (PtrStream < DataB64Length);

        DataB64 = '';
        BufferTabBits = '';
        TableData[Selected.resource.i][Selected.table.i] = rows;

        fin = new Date().getTime() - debut;
        console.log('Performance parsing B64: ' + fin + ' ms.')
    }



    /************************************************************
    End Base 64 function                                        *
    ************************************************************/



    /***
      * Display error in browser console.
      *
      * Ouput : boolean (store in var modeDebug)
      *
      * @param : boolean
      * @return : string
    ***/

    this.DisplayError = function(display) {
        if(display) {
            modeDebug = true;
        } else {
            modeDebug = false;                        
        }
    }



    /***
      * Print error in console if debug mode is active.
      *
      * Ouput : boolean (store in var modeDebug)
      *
      * @param : boolean
      * @return : string
    ***/

    function debug (error) {
        if(error) {
            console.warn('DEBUG => ' + error);        
        }
    }




    /***
      * Parse TableData in XML file. 
      *
      * Output (store in var TableData) :
      * TR ==>              [Object { TD=[19]}, Object { TD=[19]}, Object { TD=[19]} ...]
      * TR[0] ==>           Object { TD=[19]}
      * TR[0].TD ==>        ["0.0763", "265.083811", "-32.254496", ...]
      * TR[0].TD[0] ==>     0.0763
      *
      * TR[x] return 1 row of data, TR[x].TD[y] return one data.
      *
      * @return (store in var TableData) : array of object (data)
    ***/

    function ParseXmlTableData() {
        var rows = {TR: []}
        var column = {TD: []};
        var i = 0, j = 0, findTable, findResource, debut = new Date().getTime(), fin;

        $(Selected.table.xml).find(prefixe + 'TR').each(function () {
            $(this).find(prefixe + 'TD').each(function () {
                column.TD[j] = $(this).text();
                j++;
            });
            rows.TR[i] = column;
            column = {TD: []};
            j = 0;
            i++;
        });

        fin = new Date().getTime() - debut;
        console.log('Performance Parsing : ' + fin + ' ms.');
        TableData[Selected.resource.i][Selected.table.i] = rows;
    }



    /***
      * Select a table, after that all called method work with it.
      *
      * @param : integer / string (parse to integer)
      * @return : boolean (store in var Selected.table.i) (false if error)
    ***/

    this.SelectTable = function(number) {
        var NbTable;

        if(typeof(number) === 'string') {
            number = parseInt(number);
        }

        NbTable = Selected.resource.tables.length;

        if(typeof(number) === 'number') {
            if(number >= 0 && number < NbTable) {
                Selected.table.i = number;
                if (Selected.resource.xml != null)
                    Selected.table.xml = Selected.resource.tables.eq(Selected.table.i);
                return true;
            } else {
                debug('Unable to select table. You specified the table number "' + number + '" but the table number should be between 0 and ' + (NbTable - 1));                        
            }
        } else {
            debug('Unable to select table. Your argument must be an integer (or an integer contain in a string).');                        
        }

        return false;
    }



    /***
      * Select a resource, after that all called method work with it.
      *
      * @param : integer
      * @return : boolean (store in var ResourceSelected) (false if error)
    ***/

    this.SelectResource = function(number) {
        var NbResource;

        if(typeof(number) === 'string') {
            number = parseInt(number);
        }

        NbResource = this.GetNbResource();

        if(typeof(number) === 'number') {
            if(number >= 0 && number < NbResource) {
                Selected.resource.i = number;
                Selected.resource.xml = vot.resource.eq(Selected.resource.i);
                Selected.resource.tables = $(Selected.resource.xml).find(prefixe + 'TABLE');
                return true;
            } else {
                debug('Unable to select resource. You specified the resource number "' + number + '" but the ressource number should be between 0 and ' + (NbResource - 1));                        
            }
        } else {
            debug('Unable to select resource. Your argument must be an integer (or an integer contain in a string).');                        
        }

        return false;
    }

    /***
      * Get fields of table 
      *
      * Output  : Array { Array[10] }
      * Array[0] ==>           Object { name="_DE", ucd="pos.eq.dec;meta.main", datatype="double", ...}
      * Array[0].name ==>      '_DE'
      * Array[0].datatype ==>  'double'
      *
      * @return : array of object
    ***/

    this.GetField = function() {
        var arrayField = [], field = {}, i = 0, findTable, findResource;

        $(Selected.table.xml).find(prefixe + 'FIELD').each(function() {
            $(this.attributes).each(function() {
                field[this.name] = this.value;
            });

            arrayField[i] = field;
            field = {};
            i += 1;
        });

        return arrayField;
    }



    /***
      * Fill TableData if it is empty.
      *
      * @return : Object (View DecodeB64 / ParseXmlTableData method for more informations).
    ***/

    this.GetData = function() {
        if (this.IsEncodeB64()) {
            if( ! TableData[Selected.resource.i][Selected.table.i]) {
                DecodeB64();
            }
        } else {
            if( ! TableData[Selected.resource.i][Selected.table.i]) {
                ParseXmlTableData();
            }
        }
        return TableData[Selected.resource.i][Selected.table.i];
    }


    /***
      * Return a specific value of the TableData, if error return boolean false.
      *
      * input : 3, 5
      * output : 265.082976
      *
      * @param : ineteger, integer 
      * @return : integer, char, boolean, ... (false if error)
    ***/

    this.GetThisData = function(x, y) {        

        var TableData = '';

        if(typeof(x) !== 'integer') {
            if(typeof(x) === 'string') {
                x = parseInt(x);
            } else {
                debug('Unable to get this data. Your argument must be an integer (or an integer contain in a string).');                
                return false;                                
            }
        } 

        if(typeof(y) !== 'integer') {
            if(typeof(y) === 'string') {
                y = parseInt(y);
            } else {
                debug('Unable to get this data. Your argument must be an integer (or an integer contain in a string).');        
                return false;        
            }
        } 

        TableData = this.GetData();

        if(x < 0 || x > TableData.TR.length) {
            debug('Unable to get this data. You specified the first argument "' + x + '" but it should be between 0 and ' + TableData.TR.length);        
            return false;        
        }

        if(y < 0 || y > TableData.TR[x].TD.length) {
            debug('Unable to get this data. You specified the second argument "' + y + '" but it should be between 0 and ' + TableData.TR.length);        
            return false;        
        }

        return TableData.TR[x].TD[y];        
    }


    /***
      * Displays information about your current XML including your selected table.
      *
      * Output  :   Object { xml="viz.xml", resource=2, table=6}
      *
      * @return : array
    ***/

    this.WhoAmI = function() {
        var array = {};

        array['xml'] = vot.name;
        array['resource'] = Selected.resource.i;
        array['table'] = Selected.table.i;

        return array;
    }


    /***
      * Check if the XML file is load by AJAX ("load" function).
      *
      * Output  : True / False
      *
      * @return : boolean
    ***/

    this.IsLoad = function() {
        if (vot.loadEtat === 'success') {
            return true;
        } else {
            return false;
        }
    }


    /***
      * Return the number of table present in the votable file.
      * /!\ Return the number of table AVALAIBLE in the votable file, not the value of TablesExamined (INFO in Votable).
      *
      * Output  : 4
      *
      * @return : integer.
    ***/

    this.GetNbTableVotable = function() {
        if( ! vot.nbTable) {
            vot.nbTable = $(xmlData).find(prefixe + 'TABLE').length;
        }

        return vot.nbTable;
    }



    /***
      * Return the number of table present in a resource.
      *
      * Output  : 2
      *
      * @return : integer.
    ***/

    this.GetNbTableResource = function() {
        if (Selected.resource.tables != null) return Selected.resource.tables.length;
        return $(Selected.resource.xml).find(prefixe + 'TABLE').length;
    }


    /***
      * Return the number of resource present in the votable file.
      *
      * Output  : 9
      *
      * @return : integer.
    ***/

    this.GetNbResource = function() {
        /*if( ! vot.nbResource) {
            vot.nbResource = $(xmlData).find(prefixe + 'RESOURCE').length;
        }*/

        return vot.nbResource;
    }


    /***
      * Return the type of encodage present in the Votable.
      *
      * Output  : BASE-64
      *
      * @return : string.
    ***/

    this.GetEncodage = function() {
        if( ! vot.encode) {
            if ($(xmlData).find(prefixe + 'BINARY').text()) {
                vot.encode = 'BASE-64';
            } else {
                vot.encode = 'UTF-8';
            }
        }
        return vot.encode;        
    }


    /***
      * Check if the encodage of characters is in base 64.
      *
      * Output  : True / False
      *
      * @return : boolean
    ***/

    this.IsEncodeB64 = function() {
        if (vot.encode === 'base-64') {
            return true;
        } 
        return false;
    }


    /***
      * Get fields of table (HTML)
      *
      * Output  : 
      *
      *                <tr>
      *                        <th>_r</th>
      *                 <th>_RAJ2000</th>
      *                        <th>_DEJ2000</th>
      *                        <th>LC</th>
      *                 <th>Xpos</th>
      *                        <th>Ypos</th>
      *                        <th>B-V</th>
      *                        <th>Vmag</th>
      *                        <th>_RA</th>
      *                        <th>_DE</th>
      *                </tr>
      *
      * @return : string
    ***/

    this.GetHtmlField = function() {
        var i, field, nb_field, output;

        field = this.GetField();
        nb_field = field.length;

        output += '<tr>';

        for (i = 0; i < nb_field; i++) {
            output += '<th>' + field[i].name + '</th>';
        }

        output += '</tr>';

        return output;
    }



    /***
      * Get TableData of table (HTML)
      *
      * Output  : 
      *
      *                <tr>
      *                        <td>0.2006</td>
      *                        <td>323.365156</td>
      *                        <td>-00.825385</td>
      *                        <td>73964</td>
      *                        <td>973.824</td>
      *                        <td>1100.664</td>
      *                        <td>0.866</td>
      *                        <td>13.935</td>
      *                        <td>323.365156</td>
      *                        <td>-00.825385</td>
      *                </tr>
      *
      * @param : integer (optional), integer (optional)
      * @return : string
    ***/

    this.GetHtmlData = function(min, max) {
        var i, j, data, nbRows, nbColumn, output;

        if(typeof(min) === 'string') {
            min = parseInt(min);
        }
        if(typeof(max) === 'string') {
            max = parseInt(max);
        }

        min = min || 0; // Optional param;

        data = this.GetData();

        if(max && max < data.TR.length) {
            nbRows = max;
        } else {
            if( ! max) {
                debug('Warning. You specified the maximum at "' + max + '" but the maximum possible is ' + data.TR.length);        
            }
            nbRows = data.TR.length;        
        }

        for (i = min; i < nbRows; i++) {
            nbColumn = data.TR[i].TD.length;
            output += '<tr>';

            for (j = 0; j < nbColumn; j++) {
                output += '<td>' + data.TR[i].TD[j] + '</td>';
            }

            output += '</tr>';
        }

        return output;
    }


    /***
      * Get meta (info, description) of the Votable file.
      *
      * output :
      * 
      * DESCRIPTION   => Object { _text="\n VizieR Astronomical ...n@simbad.u-strasbg.fr\n "}
      * INFO          => [Object { ID="VERSION", name="votable-version", value="1.88 (30-Jan-2012)"}, 
                          Object { ID="Ref", name="-ref", value="VIZ4f5e112a3b94"}, ...]
      * INFO[1].VALUE => VIZ4f5e112a3b94
      * VOTABLE       => Object { version="1.2", xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance", xmlns="http://www.ivoa.net/xml/VOTable/v1.2", plus...}
      * 
      * @return : array of object
    ***/        

    this.GetVotableMeta = function() {
        return ParseXmlMeta('votable');
    }


    /***
      * Get meta (info, description, coosys) of a ressource (resource selected via method SelectResource() ).
      *
      * output :
      * 
      * COOSYS       => [Object { ID="B1950", system="eq_FK4", equinox="B1950"}, Object { ID="J2000", system="eq_FK5", equinox="J2000"}]
      * COOSYS[0].ID => B1950
      * DESCRIPTION  => Object { _text="Brightest stars in a for...31 (Berkhuijsen+, 1988)"}
      * RESOURCE     => Object { ID="yCat_2145", name="II/145"}
      * 
      * @return : array of object
    ***/                

    this.GetResourceMeta = function () {
        return ParseXmlMeta('resource');
    }


    /***
      * Get meta (info, description) of a table (table selected via method SelectTable() ).
      *
      * output :
      *
      * DESCRIPTION => Object { _text="Foreground stars in M31 field"}
      * TABLE       => Object { ID="II_145_table", name="II/145/table"}*
      * TABLE.ID    =>  II_145_table
      * 
      * @return : array of object
    ***/        

    this.GetTableMeta = function () {
        return ParseXmlMeta('table');
    }


    /***
      * Parse Xml Meta for three case : Votable, Resource and Table.
      *
      * Exemple : view the doc of the following method : GetVotableMeta(), GetResourceMeta() and GetTableMeta().
      * 
      * @param : string ('votable' OR 'resource' OR 'table'
      * @return : array of object
    ***/

    function ParseXmlMeta (metaType) {
        var i, j, findNode, node, attributName, output = {}, data = {}, tab = [], CptAttribut = [],  txt = "" ;

        if(metaType === 'votable') {
            findNode = $(xmlData).find(prefixe + "VOTABLE");
        } else if (metaType === 'resource') {
            findNode = $(Selected.resource.xml);
        } else { // table
            findNode = $(Selected.table.xml);
        }

        // Get attribut of Votable, ressource, or table.
        for(j = 0; j < findNode[0].attributes.length; j += 1) {
            data[findNode[0].attributes[j].name] = findNode[0].attributes[j].value;
        }        

        output[findNode[0].tagName] = data;
        data = {};


        node = findNode.children();

        // Get children attribut of Votable, ressource, or table. 
        for(i = 0; i < node.length; i += 1) {

            attributName = node[i].tagName;

            // Stop the loop, we enter in a resource / table / field
            if(attributName === prefixe + 'RESOURCE' || attributName === prefixe + 'TABLE' || attributName === prefixe + 'FIELD') {
                return output;
            } else { 
                // get attributes, for example return : array['name'] = "ipopu";
                for(j = 0; j < node[i].attributes.length; j += 1) {
                    data[node[i].attributes[j].name] = node[i].attributes[j].value;
                }                

                // get attributes, for example return : array['name'] = "ipopu";
                for(j = 0; j < node[i].attributes.length; j += 1) {
                    data[node[i].attributes[j].name] = node[i].attributes[j].value;
                }                

                // get data text include in attributes (ex pickup from Votable : <DESCRIPTION>The Initial Gaia Source List (IGSL) (Smart, 2013)</DESCRIPTION>)
                if(node[i].innerHTML) {
                    if(node[i].innerHTML.trim() !== '' && node[i].innerHTML !== '\n') {
                        data['_text'] = node[i].innerHTML;
                    }
                }
                else { // Support for IE / Safari
                    txt = new XMLSerializer().serializeToString(node[i]);
                    txt = txt.match(/>(.*?)</);

                    if(txt) {
                        if(txt.length === 2) {
                            data['_text'] = txt[1];
                        }
                    }
                }

                // First case : One data in an attribut
                if( ! output[attributName]) {
                    output[attributName] = data;        
                    CptAttribut[attributName] = 1;
                } else if (CptAttribut[attributName] === 1) { // Second case : Two data in the same attribut
                    tab.push(output[attributName]); // Move first data 
                    tab.push(data); // Move second data
                    output[attributName] = tab;                                        
                    CptAttribut[attributName] = 2;        
                } else { // Third case : Two and more data in the same attribut
                    output[attributName].push(data);
                    CptAttribut[attributName] += 1;                                                
                }
            } 

            tab = [];
            data = {};
        }

        return output;
    }
}
