var app = require('../../server/server.js');
var loopback = require('loopback');
var path = require('path');
var sweet = require('sweet.js');
var fs = require('fs');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var DocumentSchema = new Schema({}, {strict: false});
var AttributesReader = require('./attributesReader.js');
var intepreterFile = __dirname + "/macro.sjs";
var macro;

fs.readFile(intepreterFile, function(err, result) {
    if(err)
    {
        console.log("> Error: can't read macro definitions file. ", err);
        throw new Error("Error: can't read macro definitions file. " + err);
    }
    else
    {
        macro = result;
        console.log("> DSL configuration file read correctly");
    }
});


module.exports = function(DSL) {
    // Create a DSL definition
    DSL.saveDefinition = function(userId, type, name, source, externalDatabaseId, cb) {
        
        // Clear and returns the error
        function relationError(DSLInstance, err) {
            DSL.destroyById(DSLInstance.id, function(err) {
                if(err) 
                    return cb(err, null, null);
            });
            console.log("> Error creating relationship for the DSL");
            return cb(err, null, null);
        }
        
        if(!type || !name)
        {
            var error = {
                message: "Missing data for DSL creation"
            };
            return cb(null, error, null);
        }
        DSL.create({type: type, name: name, source: source, createdBy: userId, externalDatabaseId: externalDatabaseId}, function(err, DSLInstance) {
            if(err || !DSLInstance)
            {
               console.log('> Failed creating DSL.');
               return cb(err);
            }
            // Define relation between user and DSL
            var DSLAccess = app.models.DSLAccess;
            var user = app.models.user;
            user.findById(userId, function(err, userInstance) {
                if(err)
                {
                    relationError(DSLInstance, err);
                }
                var Company = app.models.Company;
                Company.findById(userInstance.companyId, function(err, company) {
                    if(err || !company)
                        return cb(err, null, null);
                    // Add DSL to the Admins of the company
                    company.users({where: {role: "Administrator"}}, function(err, admins) {
                        if(err || !admins)
                            return cb(err, null, null);
                        admins.forEach(function(admin, i) 
                        {
                            DSLAccess.create({userId: admin.id, dslId: DSLInstance.id, permission: "write"}, function(err, accessInstance) {
                                if(err)
                                    return relationError(DSLInstance, err);
                            });
                        });
                    });
                    // Add DSL to the Owner of the company
                    company.owner(function(err, owner) {
                        if(err)
                        {
                            return relationError(DSLInstance, err);
                        }
                        DSLAccess.create({userId: owner.id, dslId: DSLInstance.id, permission: "write"}, function(err, accessInstance) {
                            if(err)
                                return relationError(DSLInstance, err);
                        });
                    });
                    // If user creating the DSL is not Owner or Admin add DSL to him
                    if(userInstance.role == "Member")
                    {
                        DSLAccess.create({userId: userInstance.id, dslId: DSLInstance.id, permission: "write"}, function(err, accessInstance) {
                            if(err)
                                return relationError(DSLInstance, err);
                        });
                    }
                    console.log("> Created DSL:", DSLInstance.id);
                    return cb(null, null, DSLInstance);
                });
            });
       });
    };
    
    DSL.remoteMethod(
        'saveDefinition',
        {
            description: "Save a DSL definition",
            accepts: [
                { arg: 'userId', type: 'string', required: true, description: 'User id' },
                { arg: 'type', type: 'string', required: true, description: 'Definition type' },
                { arg: 'name', type: 'string', required: true, description: 'Definition name' },
                { arg: 'source', type: 'string', required: true, description: 'Definition source' },
                { arg: 'externalDatabaseId', type: 'string', required: true, description: 'External DatabaseId id' }
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'definition', type: 'Object'}
            ],
            http: { verb: 'post', path: '/saveDefinition' }
        }
    );
    
    DSL.overwriteDefinition = function(id, type, source, name, cb) {
        DSL.findById(id, function(err, DSLInstance) {
            if(err)
            {
                return cb(err, null, null);
            }
            DSLInstance.updateAttributes({type: type, source: source, name: name}, function(err, newDSL) {
                if(err)
                {
                    return cb(err, null, null);
                }
                console.log("> Updated DSL:", newDSL.id);
                return cb(null, null, newDSL);
            });
        });
    };
    
    DSL.remoteMethod(
        'overwriteDefinition',
        {
            description: "Overwrite a DSL definition",
            accepts: [
                { arg: 'id', type: 'string', required: true, description: 'Definition id' },
                { arg: 'type', type: 'string', required: true, description: 'Definition type' },
                { arg: 'source', type: 'string', required: true, description: 'Definition source' },
                { arg: 'name', type: 'string', required: true, description: 'Definition name' }
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'definition', type: 'Object'}
            ],
            http: { verb: 'put', path: '/:id/overwriteDefinition' }
        }
    );
    
    DSL.deleteDefinition = function(id, cb) {
        DSL.findById(id, function(err, DSLInstance) {
            if (err)
            {
                return cb(err, null);
            }
            DSLInstance.users({ where: {} }, function(err, users) {
                if(err)
                {
                    return cb(err, null);
                }
                users.forEach(function(user, i) {
                    DSLInstance.users.remove(user, function(err) {
                        if(err)
                        {
                            console.log("> Error deleting DSL definition");
                            return cb(err, null);
                        }
                    });
                });
                // Success
                DSL.destroyById(DSLInstance.id, function(err) {
                    if(err) 
                    {
                        return cb(err, null);
                    }
                    console.log("> DSL definition deleted:", id);
                    return cb(null, null);
                });
                
            });
                
        });
    };
    
    DSL.remoteMethod(
        'deleteDefinition',
        {
            description: "Delete one DSL definition and its relationships",
            accepts: [
                { arg: 'id', type: 'string', required: true, description: 'Definition id' }
            ],
            returns: [
                { arg: 'error', type: 'Object' }
            ],
            http: { verb: 'delete', path: '/:id/deleteDefinition' }
        }
        
    );
    
    DSL.deleteAllSelectedDefinitions = function(arrayId, cb) {
        
        arrayId.forEach(function(id, index) {
            DSL.findById(id, function(err, DSLInstance) {
                if (err)
                {
                    return cb(err, null);
                }
                DSLInstance.users({ where: {} }, function(err, users) {
                    if(err)
                    {
                        return cb(err, null);
                    }
                    users.forEach(function(user, i) {
                        DSLInstance.users.remove(user, function(err) {
                            if(err)
                            {
                                console.log("> Error deleting DSL definition");
                                return cb(err, null);
                            }
                        });
                    });
                    DSL.destroyById(DSLInstance.id, function(err) {
                        if(err)
                        {
                            return cb(err, null);
                        }
                    });
                });
            });
            if (index == arrayId.length-1)
            {
                console.log("> DSL definitions deleted");
                return cb(null, null);
            }
        });
    };
    
    DSL.remoteMethod(
        'deleteAllSelectedDefinitions',
        {
            description: "Delete all selected DSL definitions and its relationships",
            accepts: [
                { arg: 'arrayId', type: 'Array', required: true, description: 'Definitions id' }
            ],
            returns: [
                { arg: 'error', type: 'Object' }
            ],
            http: { verb: 'delete', path: '/:id/deleteAllSelectedDefinitions' }
        }
        
    );
    
    
    DSL.changeDefinitionPermissions = function(id, userId, permission, cb) {
        var DSLAccess = app.models.DSLAccess;
        var user = app.models.user;
        DSLAccess.findOne({where: {userId: userId, dslId: id}, limit: 1}, function(err, accessInstance) {
            if(err)
            {
                return cb(err);
            }
            user.findById(userId, function(err, userInstance) {
               if(err)
               {
                   return cb(err);
               }
               // User has access to dsl
                if(accessInstance) 
                {
                    if(permission == "none")
                    {
                        userInstance.permission = accessInstance.permission;
                        DSLAccess.destroyById(accessInstance.id, function(err) {
                            if(err)
                            {
                                return cb(err);
                            }
                            console.log("> Permission removed for DSL:", id);
                            return cb(null, null, 'delete', userInstance);
                        });
                    }
                    else
                    {
                        accessInstance.permission = permission;
                        userInstance.permission = accessInstance.permission;
                        accessInstance.save();
                        console.log("> Permission changed for DSL:", id);
                        return cb(null, null, 'update', userInstance);
                    }
                }
                else // User don't have access to dsl
                {
                    DSLAccess.create({userId: userId, dslId: id, permission: permission}, function(err, newAccessInstance) {
                        if(err)
                        {
                            return cb(err);
                        }
                        userInstance.permission = newAccessInstance.permission;
                        console.log("> Permission changed for DSL:", id);
                        return cb(null, null,'create', userInstance);
                    });
                }
            });
            
        });
    };
    
    DSL.remoteMethod(
        'changeDefinitionPermissions',
        {
            description: "Change the permissions for one specific DSL definition",
            accepts: [
                { arg: 'id', type: 'string', required: true, description: 'Definition id' },
                { arg: 'userId', type: 'string', required: true, description: 'User id' },
                { arg: 'permission', type: 'string', required: true, description: 'Definition permission' }
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'operation', type: 'string' },
                { arg: 'userPermission', type: 'Object' }
                
            ],
            http: { verb: 'put', path: '/:id/changeDefinitionPermissions' }
        }
        
    );
    
    DSL.uploadDefinition = function(userId, data, cb) {
        
        function relationError(DSLInstance, err) {
            DSL.destroyById(DSLInstance.id, function(err) {
                if(err)
                {
                    return cb(err, null, null);
                }
            });
            console.log("> Error creating relationship for the DSL");
            return cb(err, null, null);
        }
        
        if (!data.name || !data.type || !data.database)
        {
            var error = {
                message: "Missing data for DSL creation"
            };
            console.log("> Upload definition error: Missing data for DSL creation, impossible to create relationship for the DSL");
            return cb(null, error, null);
        }
        else
        {
            DSL.create({type: data.type, name: data.name, source: data.dsl, createdBy: userId, externalDatabaseId: data.database}, function(err, DSLInstance) {
                if(err || !DSLInstance)
                {
                   console.log('> Failed creating DSL.');
                   return cb(err);
                }
                // Define relation between user and DSL
                var DSLAccess = app.models.DSLAccess;
                var user = app.models.user;
                user.findById(userId, function(err, userInstance) {
                    if(err)
                    {
                        relationError(DSLInstance, err);
                    }
                    var Company = app.models.Company;
                    Company.findById(userInstance.companyId, function(err, company) {
                        if(err || !company)
                        {
                            return cb(err, null, null);
                        }
                        // Add DSL to the Admins of the company
                        company.users({where: {role: "Administrator"}}, function(err, admins) {
                            if(err || !admins)
                            {
                                return cb(err, null, null);
                            }
                            admins.forEach(function(admin, i) 
                            {
                                DSLAccess.create({userId: admin.id, dslId: DSLInstance.id, permission: "write"}, function(err, accessInstance) {
                                    if(err)
                                    {
                                        return relationError(DSLInstance, err);
                                    }
                                });
                            });
                        });
                        // Add DSL to the Owner of the company
                        company.owner(function(err, owner) {
                            if(err)
                            {
                                return relationError(DSLInstance, err);
                            }
                            DSLAccess.create({userId: owner.id, dslId: DSLInstance.id, permission: "write"}, function(err, accessInstance) {
                                if(err)
                                    return relationError(DSLInstance, err);
                            });
                        });
                        // If user creating the DSL is not Owner or Admin add DSL to him
                        if(userInstance.role == "Member")
                        {
                            DSLAccess.create({userId: userInstance.id, dslId: DSLInstance.id, permission: "write"}, function(err, accessInstance) {
                                if(err)
                                    return relationError(DSLInstance, err);
                            });
                        }
                        console.log("> Uploaded DSL:", DSLInstance.id);
                        return cb(null, null, DSLInstance);
                    });
                });
           });
        }
    };
    
    DSL.remoteMethod(
        'uploadDefinition',
        {
            description: "Upload a DSL definition",
            accepts: [
                { arg: 'userId', type: 'string', required: true, description: 'User id' },
                { arg: 'data', type: 'Object', required: true, description: 'Definition data' }
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'definition', type: 'Object'}
            ],
            http: { verb: 'post', path: '/uploadDefinition' }
        }
    );
    
    DSL.changeDefinitionDatabase = function(id, databaseId, cb) {
        DSL.findById(id, function(err, DSLInstance) {
            if(err)
            {
                return cb(err, null, null);
            }
            DSLInstance.updateAttributes({externalDatabaseId: databaseId}, function(err, newDSL) {
                if(err)
                {
                    return cb(err, null, null);
                }
                console.log("> Updated database of DSL:", newDSL.id);
                return cb(null, null, newDSL);
            });
        });
    };
    
    DSL.remoteMethod(
        'changeDefinitionDatabase',
        {
            description: "Overwrite a DSL definition",
            accepts: [
                { arg: 'id', type: 'string', required: true, description: 'Definition id' },
                { arg: 'externalDatabaseId', type: 'string', required: true, description: 'Database id' }
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'definition', type: 'Object'}
            ],
            http: { verb: 'put', path: '/:id/changeDefinitionDatabase' }
        }
    );
    
    DSL.sendEmail = function(userId, id, email, label, json, csv, cb) {
        var user = app.models.user;
        user.findById(userId, function(err, userInstance) {
            if(err || !userInstance)
            {
                console.log("> SendEmail failed: user not found");
                return cb(null, { message: "User not found" });
            }
            var sender;
            if(userInstance.name || userInstance.surname)
            {
                sender = userInstance.name + " " + userInstance.surname;
            }
            else
            {
                sender = userInstance.email;
            }
            var attachments = [];
            if(json)
            {
                attachments.push({
                    filename: label + ".json",
                    content: json,
                    contentType: 'application/json'
                });
            }
            if(csv)
            {
                attachments.push({
                    filename: label + ".csv",
                    content: csv,
                    contentType: 'text/csv'
                });
            }
            var template = loopback.template(path.resolve(__dirname, '../../server/views/dsl.ejs'));
            var options = {
                sender: sender
            };
            var html = template(options);

            user.app.models.Email.send({
                to: email,
                from: 'noreply@maas.com',
                subject: 'Data Sharing',
                html: html,
                attachments: attachments
            }, function(err) {
                if (err)
                {
                    console.log('> SendEmail failed: error sending email');
                    return cb(null, { message: "Error sending data sharing email" }, null);
                }
                console.log('> Sending data sharing email to:', email);
                return cb(null, null);
            });
        });
    };
    
    DSL.remoteMethod(
        'sendEmail',
        {
            description: "Send data sharing",
            accepts: [
                { arg: 'userId', type: 'string', required: true, description: 'User id' },
                { arg: 'id', type: 'string', required: true, description: 'Definition id' },
                { arg: 'email', type: 'string', required: true, description: 'Email address' },
                { arg: 'label', type: 'string', required: true, description: 'Data label' },
                { arg: 'json', type: 'string', required: true, description: 'Data (json)' },
                { arg: 'csv', type: 'string', required: true, description: 'Data (csv)' }
            ],
            returns: [
                { arg: 'error', type: 'Object' }
            ],
            http: { verb: 'post', path: '/:id/sendEmail' }
        }
    );
    
    DSL.compile = function(dsl, cb) {
        if(!dsl)
        {
            return cb("Definition has empty source", null);
        }
        var expanded;
        macro = macro.toString();
        var macroLines = macro.split("\n").length;
        try
        {
            expanded = sweet.compile(macro + dsl);
        }
        catch(err)
        {
            console.log("Sweetjs error:", err);
            var message;
            if(!err.description)
            {
                //Default message
                message = "DSL compilation error";
                var error = err.toString();
                if(error.match(/Action/g))
                {
                    message = "Action must define at least \"Export\" or \"SendEmail\"";
                }
                if(error.match(/Multiple actions/g))
                {
                    message = "Multiple actions defined, action must be unique";
                }
                if(error.match(/replacement values for syntax template must not be null or undefined/g))
                {
                    message = "Syntax error: unknown keyword or missing comma";
                }
                if(error.match(/Unexpected syntax/g))
                {
                    if(error.match(/List \[ {/g))
                        message = "Unexpected syntax: \"{\". Wrong use of parenthesis";
                    else if(error.match(/List \[ \[/g))
                        message = "Unexpected syntax: \"[\". Wrong use of parenthesis";
                    else if(error.match(/List \[ \(/g))
                        message = "Unexpected syntax: \"(\". Wrong use of parenthesis";
                    else
                    {
                        var start = "List [ ";
                        var end = " ] at:";
                        var startIndex = error.indexOf(start, 0) + start.length;
                        var endIndex = error.indexOf(end, 0);
                        var unexpected = error.substring(startIndex, endIndex);
                        startIndex = error.indexOf(start, endIndex) + start.length;
                        endIndex = error.length - 2;
                        var line = error.substring(startIndex, endIndex);
                        line = (parseInt(line) - macroLines) + 1;
                        
                        message = "Unexpected syntax";
                        if(unexpected)
                            message += ": \"" + unexpected + "\"";
                        if(!isNaN(line))
                            message += " at line " + line;
                    }
                }
                if(error.match(/expecting a : punctuator/g))
                {
                    message = "Syntax error: missing \":\"";
                }
            }
            else
            {
                message = err.description;
            }
            
            return cb(message, null);
            // errore virgole: [Error: replacement values for syntax template must not be null or undefined] 
        }
        return cb(null, expanded.code);
    };
    
    
    DSL.remoteMethod(
        'compile',
        {
            description: "Compile one DSL definition",
            accepts: [
                { arg: 'source', type: 'string', required: true, description: 'Definition source' }
            ],
            returns: [
                { arg: 'err', type: 'string' },
                { arg: 'expanded', type: 'string' }
                
            ],
            isStatic: true
        }
    );
  
    DSL.compileDefinition = function(id, cb) {
        DSL.findById(id, function(err, DSLInstance) {
            if(err)
            {
                console.log(err);
                return cb(err);
            }
            
            DSLInstance.externalDatabase(function(err, database) {
                if(err)
                {
                   console.log("> Error finding database of dsl");
                   return cb(err);
                }
                database.company(function(err, company) {
                    if (err)
                    {
                        console.log("> Error finding company of database");
                        return cb(err);
                    }
                    company.users.count(function(err, usersCount) {
                        if (err)
                        {
                            console.log("> Error finding number of users in a company");
                            return cb(err);
                        }
                        var conn = mongoose.createConnection(database.connString, {server: {poolSize: usersCount}}, function(err) {
                            if (err)
                            {
                                var error = {
                                    message: "Failed connecting database"
                                };
                                console.log('> Failed connecting database:', err);
                                return cb(null, error);
                            }
                        });
                        DSL.compile(DSLInstance.source, function(err, expanded) {
                            if(err)
                            {
                                console.log("> DSL compilation error:", err);
                                conn.close();
                                return cb(null, err);
                            }
                            var callback = function(err, identity, body) {
                                var definitionTypeError = {};
                                if(body && DSLInstance.type != body.definitionType)
                                {
                                    definitionTypeError.definitionTypeErrorMessage = "Definition type mismatch: your DSL definition doesn't match the selected type";
                                }
                                var error = null;
                                if(err)
                                {
                                    error = Object.assign(err, definitionTypeError);
                                }
                                else
                                {
                                    error = Object.getOwnPropertyNames(definitionTypeError) ? definitionTypeError : null;
                                }
                                if(Object.getOwnPropertyNames(error).length !== 0)
                                {
                                    console.log("> DSL compilation error:", error);
                                    conn.close();
                                    return cb(null, error);
                                }
                                conn.close();
                                console.log('> DSL compilation processed successfully');
                                return cb(null, null);
                            };
                            try
                            {
                                eval(expanded); // DSL.compileCell({...})
                            }
                            catch(err)
                            {
                                conn.close();
                                console.log("> DSL compilation error:", err);
                                var error = err.toString();
                                if(error.match(/ReferenceError/g) && error.match(/is not defined/g))
                                    return cb(null, "Syntax error: unexpected keyword that can't be handled (ReferenceError)");
                                else
                                    return cb(null, error);
                            }
                        });
                    });
                });
            });
        });
    };
    
    DSL.remoteMethod(
        'compileDefinition',
        {
            description: "Compile a DSL definition",
            accepts: [
                { arg: 'id', type: 'string', required: true, description: 'Definition id' }
            ],
            returns: [
                { arg: 'error', type: 'Object' }
            ],
            http: { verb: 'post', path: '/:id/compileDefinition' }
        }
    );
    
    DSL.executeNestedDocument = function(id, result, identity, body, cb) {
        var data = {};
        data.types = [];
        data.result = [{}];
        data.definitionType = "Document";
        
        if(Object.getOwnPropertyNames(body.action).length !== 0)
        {
            data.action = body.action;
        }
        
        if(body && body.rows && body.rows.length > 0)   // document with rows
        {
            data.result = [ {} ];   // initialize the object to be filled with results matching rows values
            var returned = false;
            for(var i=0; !returned && i < body.rows.length; i++)
            {
                var row = body.rows[i];
                var rowValue = result[row.name];
                
                data.types.push(row.type);
                
                if(row.transformation)
                {
                    var transformedValue;
                    try
                    {
                        transformedValue = row.transformation(rowValue);
                    }
                    catch(err)
                    {
                        returned = true;
                        return cb(null, err, null);
                    }
                    AttributesReader.checkKeywordValue({ type: row.type, value: transformedValue }, function(keywordValueError) {
                        if(Object.getOwnPropertyNames(keywordValueError).length !== 0)
                        {
                            returned = true;
                            return cb(null, keywordValueError, null);
                        }
                        else
                        {
                            if(row.label)
                            {
                                data.result[0][row.label] = transformedValue;
                            }
                            else
                            {
                                data.result[0][row.name] = transformedValue;
                            }
                            
                            if(i == body.rows.length-1)  // if all rows are checked then returns
                            {
                                returned = true;
                                return cb(null, null, data);
                            }
                        }
                    });
                }
                else
                {
                    AttributesReader.checkKeywordValue({ type: row.type, value: rowValue }, function(keywordValueError) {
                        if(Object.getOwnPropertyNames(keywordValueError).length !== 0)
                        {
                            returned = true;
                            return cb(keywordValueError, null);
                        }
                        else
                        {
                            if(row.label)
                            {
                                data.result[0][row.label] = rowValue;
                            }
                            else
                            {
                                data.result[0][row.name] = rowValue;
                            }
                            
                            if(i == body.rows.length-1)  // if all rows are checked then returns
                            {
                                returned = true;
                                return cb(null, null, data);
                            }
                        }
                    });
                }
            }
        }
        else
        {
            data.result[0] = result;
            return cb(null, null, data);
        }
    };
     
    DSL.remoteMethod(
        'executeNestedDocument',
        {
            description: "Execute a nested Document definition",
            accepts: [
                { arg: 'id', type: 'string', required: true, description: 'Collection id' },
                { arg: 'result', type: 'Object', required: true, description: 'Raw object' },
                { arg: 'identity', type: 'Object', required: true, description: 'Document identity' },
                { arg: 'body', type: 'Object', required: true, description: 'Document body' }
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'data', type: 'Object' }
            ],
            http: { verb: 'post', path: '/:id/executeNestedDocument' }
        }
    );
    
    
    
    DSL.executeDefinition = function(id, cb) {
        DSL.findById(id, function(err, DSLInstance) {
            if(err)
            {
                console.log(err);
                return cb(err);
            }
            DSLInstance.externalDatabase(function(err, database) {
                if(err || !database)
                {
                   console.log("> Error finding database of dsl");
                   return cb(err);
                }
                database.company(function(err, company) {
                    if (err)
                    {
                        console.log("> Error finding company of database");
                        return cb(err);
                    }
                    company.users.count(function(err, usersCount) {
                        if (err)
                        {
                            console.log("> Error finding number of users in a company");
                            return cb(err);
                        }
                        if(database.connected == "true")
                        {
                            var conn = mongoose.createConnection(database.connString, {server: {poolSize: usersCount}}, function(err) {
                                if (err)
                                {
                                    var error = {
                                        message: "Failed connecting database"
                                    };
                                    console.log('> Failed connecting database:', err);
                                    return cb(null, error, null);
                                }
                            });
                            
                            DSL.compile(DSLInstance.source, function(err, expanded) {
                                if(err)
                                {
                                    console.log("> DSL compilation error:", err);
                                    conn.close();
                                    return cb(null, err, null);
                                }
                                
                                var callback = function(err, identity, body) {
                                    var definitionTypeError = {};
                                    if(DSLInstance.type != body.definitionType)
                                    {
                                        definitionTypeError.definitionTypeErrorMessage = "Definition type mismatch: your DSL definition doesn't match the selected type";
                                    }
                                    var error = null;
                                    if(err)
                                    {
                                        error = Object.assign(err, definitionTypeError);
                                    }
                                    else
                                    {
                                        error = Object.getOwnPropertyNames(definitionTypeError) ? definitionTypeError : null;
                                    }
                                    if(Object.getOwnPropertyNames(error).length !== 0)
                                    {
                                        conn.close();
                                        console.log("> DSL execution stopped: compilation errors");
                                        return cb(null, error, null);
                                    }
                                    else    // compilation successful
                                    {
                                        switch(DSLInstance.type)
                                        {
                                            case "Cell":
                                                DSL.executeCell(identity, body, conn, function(error, data){
                                                    conn.close();
                                                    if(error)
                                                    {
                                                        console.log("> DSL execution error:", error);
                                                        return cb(null, error, null);
                                                    }
                                                    else
                                                    {
                                                        console.log("> DSL execution processed successfully");
                                                        if(!data.label)
                                                        {
                                                            data.label = DSLInstance.name;
                                                        }
                                                        
                                                        data.definitionType = DSLInstance.type;
                                                        return cb(null, null, data);
                                                    }
                                                });
                                                break;
                                            case "Document":
                                                DSL.executeDocument(identity, body, conn, function(error, data) {
                                                    conn.close();
                                                    if (error)
                                                    {
                                                        console.log("> DSL execution error:", error);
                                                        return cb(null, error, null);
                                                    }
                                                    else
                                                    {
                                                        console.log("> DSL execution processed successfully");
                                                        if(!data.label)
                                                        {
                                                            data.label = DSLInstance.name;
                                                        }
                                                        data.definitionType = DSLInstance.type;
                                                        return cb(null, null, data);
                                                    }
                                                });
                                                break;
                                                
                                            case "Collection":
                                                DSL.executeCollection(identity, body, conn, function(error, data) {
                                                    conn.close();
                                                    if (error)
                                                    {
                                                        console.log("> DSL execution error:", error);
                                                        return cb(null, error, null);
                                                    }
                                                    else
                                                    {
                                                        console.log("> DSL execution processed successfully");
                                                        if(!data.label)
                                                            data.label = DSLInstance.name;
                                                        data.definitionType = DSLInstance.type;
                                                        return cb(null, null, data);
                                                    }
                                                });
                                                break;
                                                
                                            case "Dashboard":
                                                DSL.executeDashboard(identity, body, conn, function(error, data) {
                                                    conn.close();
                                                    if (error)
                                                    {
                                                        console.log("> DSL execution error:", error);
                                                        return cb(null, error, null);
                                                    }
                                                    else
                                                    {
                                                        console.log("> DSL execution processed successfully");
                                                        if(!data.label)
                                                            data.label = DSLInstance.name;
                                                        data.definitionType = DSLInstance.type;
                                                        return cb(null, null, data);
                                                    }
                                                });
                                                break;
                                        }
                                    }
                                };
                                try
                                {
                                    eval(expanded); // DSL.compile...
                                }
                                catch(err)
                                {
                                    conn.close();
                                    console.log("> DSL execution stopped:", err);
                                    return cb(null, err.toString(), null);
                                }
                            });
                        }
                        else
                        {
                            var error = {
                                message: "Failed connecting: database is disconnected"
                            };
                            console.log('> Failed connecting: database is disconnected');
                            return cb(null, error, null);
                        }
                    });
                });
            });
        });
    };
    
    DSL.remoteMethod(
        'executeDefinition',
        {
            description: "Execute a DSL definition",
            accepts: [
                { arg: 'id', type: 'string', required: true, description: 'Definition id' }
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'data', type: 'Object' }
            ],
            http: { verb: 'post', path: '/:id/executeDefinition' }
        }
    );
    
    /* -------------------------------- CELL -------------------------------- 
    
    Two types of cell:
        
        1) Cell with value:
            Identity:
                type | required | "string"
                label | optional
                columnLabel | optional
                transformation | optional
            Body:
                value | required
        
        2) Cell without value:
            Identity:
                name | required
                table | required
                label | optional
                transformation | optional
                columnLabel | optional
                type | required | "string"
                sortby | optional
                order | optional | "asc"
                query | optional
            Body:
                empty                       */
                
    DSL.compileCell = function(identity, body, cb) {
        if(Object.getOwnPropertyNames(body).length !== 0)   // Cell with a value
        {
            AttributesReader.checkSupportedAttributes(Object.assign(identity, body), ['type', 'label', 'columnLabel', 'transformation', 'value'], function(unsupportedAttributesError) {
                AttributesReader.readRequiredAttributes(body, ['value'], function(missingRequiredBodyAttributesError) {
                    AttributesReader.readRequiredAttributes(identity, ['type', 'columnLabel'], function(missingRequiredIdentityAttributesError) {
                        AttributesReader.checkKeywordValue({type: identity.type, transformation: identity.transformation, value: body.value}, function(keywordValueError) {
                            if (identity.type.type && identity.type.type == "image")
                            {
                                AttributesReader.checkSupportedAttributes(identity.type, ['height', 'width', 'type'], function(unsupportedImageAttributesError) {
                                    AttributesReader.checkKeywordValue({ height: identity.type.height, width: identity.type.width}, function(keywordImageValueError) {
                                        var error = Object.assign(unsupportedAttributesError, missingRequiredBodyAttributesError, missingRequiredIdentityAttributesError,
                                        keywordValueError, unsupportedImageAttributesError, keywordImageValueError);
                                        if(Object.getOwnPropertyNames(error).length !== 0)
                                        {
                                            return cb(error, null, null);
                                        }
                                        else
                                        {
                                            body.definitionType = "Cell";
                                            return cb(null, identity, body);
                                        }
                                    });
                                });
                            }
                            else if (identity.type.type && identity.type.type)
                            {
                                AttributesReader.checkSupportedAttributes(identity.type, ['label', 'type'], function(unsupportedLinkAttributesError) {
                                    AttributesReader.checkKeywordValue({ label: identity.type.label }, function(keywordLinkValueError) {
                                        var error = Object.assign(unsupportedAttributesError, missingRequiredBodyAttributesError, missingRequiredIdentityAttributesError,
                                        keywordValueError, unsupportedLinkAttributesError, keywordLinkValueError);
                                        if(Object.getOwnPropertyNames(error).length !== 0)
                                        {
                                            return cb(error, null, null);
                                        }
                                        else
                                        {
                                            body.definitionType = "Cell";
                                            return cb(null, identity, body);
                                        }
                                    });
                                });
                            }
                            else
                            {
                                var error = Object.assign(unsupportedAttributesError, missingRequiredBodyAttributesError, missingRequiredIdentityAttributesError, keywordValueError);
                                if(Object.getOwnPropertyNames(error).length !== 0)
                                {
                                    return cb(error, null, null);
                                }
                                else
                                {
                                    body.definitionType = "Cell";
                                    return cb(null, identity, body);
                                }
                            }
                        });
                    });
                });
            });
        }
        else    // Cell without a value
        {
            AttributesReader.checkSupportedAttributes(Object.assign(identity, body), ['name', 'table', 'label', 'columnLabel', 'transformation', 'type', 'sortby', 'order', 'query'], function(unsupportedAttributesError) {
                AttributesReader.readRequiredAttributes(identity, ['type', 'name', 'table'], function(missingRequiredIdentityAttributesError) {
                    var keywordsValue = {
                        type: identity.type, 
                        transformation: identity.transformation,
                        order: identity.order, 
                        query: identity.query,
                        name: identity.name,
                        columnLabel: identity.columnLabel,
                        table: identity.table,
                        sortby: identity.sortby,
                        label: identity.label
                    };
                    AttributesReader.checkKeywordValue(keywordsValue, function(keywordValueError) {
                        if (identity.type.type && identity.type.type == "image")
                        {
                            AttributesReader.checkSupportedAttributes(identity.type, ['height', 'width', 'type'], function(unsupportedImageAttributesError) {
                                AttributesReader.checkKeywordValue({ height: identity.type.height, width: identity.type.width}, function(keywordImageValueError) {
                                    var error = Object.assign(unsupportedAttributesError, missingRequiredIdentityAttributesError,
                                    keywordValueError, unsupportedImageAttributesError, keywordImageValueError);
                                    if(Object.getOwnPropertyNames(error).length !== 0)
                                    {
                                        return cb(error, null, null);
                                    }
                                    else
                                    {
                                        body.definitionType = "Cell";
                                        return cb(null, identity, body);
                                    }
                                });
                            });
                        }
                        else if (identity.type.type && identity.type.type)
                        {
                            AttributesReader.checkSupportedAttributes(identity.type, ['label', 'type'], function(unsupportedLinkAttributesError) {
                                AttributesReader.checkKeywordValue({ label: identity.type.label }, function(keywordLinkValueError) {
                                    var error = Object.assign(unsupportedAttributesError, missingRequiredIdentityAttributesError,
                                    keywordValueError, unsupportedLinkAttributesError, keywordLinkValueError);
                                    if(Object.getOwnPropertyNames(error).length !== 0)
                                    {
                                        return cb(error, null, null);
                                    }
                                    else
                                    {
                                        body.definitionType = "Cell";
                                        return cb(null, identity, body);
                                    }
                                });
                            });
                        }
                        else
                        {
                            var error = Object.assign(unsupportedAttributesError, missingRequiredIdentityAttributesError, keywordValueError);
                            if(Object.getOwnPropertyNames(error).length !== 0)
                            {
                                return cb(error, null, null);
                            }
                            else
                            {
                                body.definitionType = "Cell";
                                return cb(null, identity, body);
                            }
                        }
                    });
                });
            });
        }
    };
    
    DSL.remoteMethod(
        'compileCell',
        {
            description: "Compile a Cell macro",
            isStatic: true,
            accepts : [
                { arg: 'identity', type: 'Object', required: true, description: 'Cell identity' },
                { arg: 'body', type: 'Object', required: true, description: 'Cell body' }
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'identity', type: 'Object' },
                { arg: 'body', type: 'Object' }
            ]
        }
        
    );
    
    DSL.executeCell = function(identity, body, conn, cb) {
        var data = {};
        data.types = [];
        if(Object.getOwnPropertyNames(body).length === 0)   // cell without value
        {
            DocumentSchema.set('collection', identity.table);
            var collection = conn.model(identity.table, DocumentSchema);
            var mongoose_query;
            if(identity.query)
            {
                mongoose_query = collection.find(identity.query, { _id: 0});
            }
            else
            {
                mongoose_query = collection.find({}, { _id: 0});
            }
            mongoose_query.setOptions({lean: true});
            mongoose_query.select(identity.name);
            if(identity.order)
            {
                if(identity.sortby)
                {
                    mongoose_query.sort({[identity.sortby]: identity.order == "asc" ? 1 : -1});
                }
                else
                {
                    mongoose_query.sort({[identity.name]: identity.order == "asc" ? 1 : -1});
                }
            }
            else
            {
                if(identity.sortby)
                {
                    mongoose_query.sort({[identity.sortby]: 1});
                }
            }
            mongoose_query.limit(1);
            mongoose_query.exec(function(err, result) {
                if (err)
                {
                    return cb(err, null);
                }
                if(result.length > 0)
                {
                    var keywordsValue = {
                      type: identity.type,
                      value: result[0][identity.name]
                    };
                    
                    AttributesReader.checkKeywordValue(keywordsValue, function(keywordValueError) {
                        if(Object.getOwnPropertyNames(keywordValueError).length !== 0)
                        {
                            return cb(keywordValueError, null);
                        }
                        else
                        {
                            if(identity.label)
                            {
                                data.label = identity.label;
                            }
                            data.types.push(identity.type);
                            if (identity.columnLabel)
                            {
                                data.result = [
                                    {
                                       [identity.columnLabel]: result[0][identity.name]
                                    }
                                ];
                            }
                            else
                            {
                                data.result = result;
                            }
                            return cb(null, data);
                        }
                    });
                }
                else
                {
                    return cb(null, data);
                }
            });
        }
        else    // cell with value
        {
            var columnLabel = identity.columnLabel;
            var value = body.value;
            if(identity.label)
            {
                data.label = identity.label;
            }
            data.types.push(identity.type);
            if(identity.transformation)
            {
                var transformedValue;
                try
                {
                    transformedValue = identity.transformation(value);
                }
                catch(err)
                {
                    return cb(err, null);
                }
                AttributesReader.checkKeywordValue({ type: identity.type, value: transformedValue }, function(keywordValueError) {
                    if(Object.getOwnPropertyNames(keywordValueError).length !== 0)
                    {
                        return cb(keywordValueError, null);
                    }
                    else
                    {
                        data.result = [
                            {
                               [columnLabel]: transformedValue
                            }
                        ];
                        return cb(null, data);
                    }
                });
            }
            else
            {
                data.result = [
                    {
                       [columnLabel]: value
                    }
                ];
                return cb(null, data);
            }
        }
    };
    
    DSL.remoteMethod(
        'executeCell',
        {
            description: "Execute a Cell macro",
            isStatic: true,
            accepts : [
                { arg: 'identity', type: 'Object', required: true, description: 'Cell identity' },
                { arg: 'body', type: 'Object', required: true, description: 'Cell body' }
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'data', type: 'Object' }
            ]
        }
    );
    
    /* -------------------------------- DOCUMENT -------------------------------- 
    
    Document ( 
        table: 'users',
        label: 'Users',
        sortby: 'surname',
        order: 'asc',
        query: {age : { $lt : 40}}
    ) {
        row(
            name: 'surname',
            label: 'Surname',
            type: 'string'
        )
        row(
            name: 'name',
            label: 'Name',
            type: 'string'
        )
        row(
            name: 'orders',
            label: 'Orders',
            type: 'number',
            transformation: function(val) { return val.length; }
        )
    }
    
    two types of independent Document:
    
    1)
        Identity:
            table | required
            label | optional
            sortby | optional
            order | optional | asc
            query | optional
        Body:
            row
            action | optional
    Row:
        Identity:
            name | required
            label | optional
            transformation | optional
            type | required
    
    2)
        Identity:
            table | required
            label | optional
            sortby | optional
            order | optional | asc
            query | optional
        Body:
            action | optional
            
    */
    
    DSL.compileDocument = function(identity, rows, action, nested, cb) {
        var body = {};
        body.definitionType = "Document";
        if(!nested)
        {
            AttributesReader.checkSupportedAttributes(identity, ['table', 'label', 'sortby', 'query', 'order', 'populate'], function(unsupportedIdentityAttributesError) {
                AttributesReader.readRequiredAttributes(identity, ['table'], function(missingRequiredIdentityAttributesError) {
                    var keywords = {
                        table: identity.table,
                        label: identity.label,
                        sortby: identity.sortby,
                        order: identity.order,
                        query: identity.query,
                        populate: identity.populate
                    };
                    AttributesReader.checkKeywordValue(keywords, function(identityKeywordValueError) {
                        AttributesReader.checkSupportedAttributes(action, ['Export', 'SendEmail'], function(unsupportedActionAttributesError) {
                            AttributesReader.checkKeywordValue({Export: action.Export, SendEmail: action.SendEmail}, function(actionKeywordValueError) {
                                if(rows.length !== 0)   // Document with rows
                                {
                                    var returned = false;
                                    
                                    for(var i = 0; !returned && i < rows.length; i++)     // body.forEach(function(row, i) {
                                    {
                                        var row = rows[i];
                                        AttributesReader.checkSupportedAttributes(row, ['name', 'label', 'type', 'transformation'], function(unsupportedRowAttributesError) {
                                            AttributesReader.readRequiredAttributes(row, ['name', 'type'], function(missingRequiredRowAttributesError) {
                                                var keywords = {
                                                    name: row.name,
                                                    label: row.label,
                                                    type: row.type,
                                                    transformation: row.transformation
                                                };
                                                AttributesReader.checkKeywordValue(keywords, function(rowKeywordValueError) {
                                                    var rowError;
                                                    
                                                    if (row.type.type && row.type.type == "image")
                                                    {
                                                        AttributesReader.checkSupportedAttributes(row.type, ['height', 'width', 'type'], function(unsupportedImageAttributesError) {
                                                            AttributesReader.checkKeywordValue({ height: row.type.height, width: row.type.width}, function(keywordImageValueError) {
                                                                rowError = Object.assign(unsupportedRowAttributesError, missingRequiredRowAttributesError, rowKeywordValueError, unsupportedImageAttributesError, keywordImageValueError);            
                                                            });
                                                        });
                                                    }
                                                    else if (row.type.type && row.type.type)
                                                    {
                                                        AttributesReader.checkSupportedAttributes(row.type, ['label', 'type'], function(unsupportedLinkAttributesError) {
                                                            AttributesReader.checkKeywordValue({ label: row.type.label }, function(keywordLinkValueError) {
                                                                rowError = Object.assign(unsupportedRowAttributesError, missingRequiredRowAttributesError, rowKeywordValueError, unsupportedLinkAttributesError, keywordLinkValueError);
                                                            });
                                                        });
                                                    }
                                                    else
                                                    {
                                                        rowError = Object.assign(unsupportedRowAttributesError, missingRequiredRowAttributesError, rowKeywordValueError);
                                                    }
                                                    var error = Object.assign(unsupportedIdentityAttributesError, missingRequiredIdentityAttributesError, 
                                                                            identityKeywordValueError, unsupportedActionAttributesError, actionKeywordValueError, rowError);
                                                    if(Object.getOwnPropertyNames(rowError).length !== 0)
                                                    {
                                                        returned = true;
                                                        return cb(error, null, null);   // return the errors occurred in the first wrong row
                                                    }
                                                    else
                                                    {
                                                        if(i == rows.length-1)  // last row in body, all rows are ok
                                                        {
                                                            if(Object.getOwnPropertyNames(error).length !== 0)    // general errors from above
                                                            {
                                                                returned = true;
                                                                return cb(error, null, null);
                                                            }
                                                            else 
                                                            {
                                                                body.action = action;
                                                                body.rows = rows;
                                                                returned = true;
                                                                return cb(null, identity, body);
                                                            }
                                                        }
                                                    }
                                                });
                                            });
                                        });
                                    }
                                }
                                else    //Document without rows
                                {
                                    body.action = action;
                                    var error = Object.assign(unsupportedIdentityAttributesError, missingRequiredIdentityAttributesError, identityKeywordValueError, 
                                    unsupportedActionAttributesError, actionKeywordValueError);
                                    if(Object.getOwnPropertyNames(error).length !== 0)
                                    {
                                        return cb(error, null, null);
                                    }
                                    else
                                    {
                                        return cb(null, identity, body);
                                    }
                                }
                            });
                        });
                    });
                });
            });
        }
        else    // Document inside a collection
        {
            AttributesReader.checkSupportedAttributes(identity, ['populate'], function(unsupportedIdentityAttributesError) {
                AttributesReader.checkKeywordValue({populate: identity.populate}, function(identityKeywordValueError) {
                    AttributesReader.checkSupportedAttributes(action, ['Export', 'SendEmail'], function(unsupportedActionAttributesError) {
                        AttributesReader.checkKeywordValue({Export: action.Export, SendEmail: action.SendEmail}, function(actionKeywordValueError) {
                            if(rows.length !== 0)   // Document with rows
                            {
                                var returned = false;
                                for(var i = 0; !returned && i < rows.length; i++)     // body.forEach(function(row, i) {
                                {
                                    var row = rows[i];
                                    AttributesReader.checkSupportedAttributes(row, ['name', 'label', 'type', 'transformation'], function(unsupportedRowAttributesError) {
                                        AttributesReader.readRequiredAttributes(row, ['name', 'type'], function(missingRequiredRowAttributesError) {
                                            var keywords = {
                                                name: row.name,
                                                label: row.label,
                                                type: row.type,
                                                transformation: row.transformation
                                            };
                                            AttributesReader.checkKeywordValue(keywords, function(rowKeywordValueError) {
                                                var rowError;  
                                                if (row.type.type && row.type.type == "image")
                                                {
                                                    AttributesReader.checkSupportedAttributes(row.type, ['height', 'width', 'type'], function(unsupportedImageAttributesError) {
                                                        AttributesReader.checkKeywordValue({ height: row.type.height, width: row.type.width}, function(keywordImageValueError) {
                                                            rowError = Object.assign(unsupportedRowAttributesError, missingRequiredRowAttributesError, rowKeywordValueError, unsupportedImageAttributesError, keywordImageValueError);            
                                                        });
                                                    });
                                                }
                                                else if (row.type.type && row.type.type)
                                                {
                                                    AttributesReader.checkSupportedAttributes(row.type, ['label', 'type'], function(unsupportedLinkAttributesError) {
                                                        AttributesReader.checkKeywordValue({ label: row.type.label }, function(keywordLinkValueError) {
                                                            rowError = Object.assign(unsupportedRowAttributesError, missingRequiredRowAttributesError, rowKeywordValueError, unsupportedLinkAttributesError, keywordLinkValueError);
                                                        });
                                                    });
                                                }
                                                else
                                                {
                                                    rowError = Object.assign(unsupportedRowAttributesError, missingRequiredRowAttributesError, rowKeywordValueError);
                                                }
                                                var error = Object.assign(unsupportedIdentityAttributesError, identityKeywordValueError, 
                                                unsupportedActionAttributesError, actionKeywordValueError, rowError);
                                                if(Object.getOwnPropertyNames(rowError).length !== 0)
                                                {
                                                    returned = true;
                                                    return cb(error, null, null);   // return the errors occurred in the first wrong row
                                                }
                                                else
                                                {
                                                    if(i == rows.length-1)  // last row in body, all rows are ok
                                                    {
                                                        if(Object.getOwnPropertyNames(error).length !== 0)    // general errors from above
                                                        {
                                                            returned = true;
                                                            return cb(error, null, null);
                                                        }
                                                        else 
                                                        {
                                                            body.action = action;
                                                            body.rows = rows;
                                                            returned = true;
                                                            return cb(null, identity, body);
                                                        }
                                                    }
                                                }
                                            });
                                        });
                                    });
                                }
                            }
                            else    //Document without rows
                            {
                                body.action = action;
                                var error = Object.assign(unsupportedIdentityAttributesError, identityKeywordValueError, 
                                unsupportedActionAttributesError, actionKeywordValueError);
                                if(Object.getOwnPropertyNames(error).length !== 0)
                                {
                                    return cb(error, null, null);
                                }
                                else
                                {
                                    return cb(null, identity, body);
                                }
                            }
                        });
                    });
                });
            });
        }
    };
    
    DSL.remoteMethod(
        'compileDocument',
        {
            description: "Compile a Document macro",
            isStatic: true,
            accepts : [
                { arg: 'identity', type: 'Object', required: true, description: 'Document identity' },
                { arg: 'rows', type: 'Object', required: true, description: 'Document rows' },
                { arg: 'action', type: 'Object', required: true, description: 'Document action'}
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'identity', type: 'Object' },
                { arg: 'body', type: 'Object' }
            ]
        }
    );
    
    DSL.executeDocument = function(identity, body, conn, cb) {
        var data = {};
        data.types = [];
        if(identity.label)
        {
            data.label = identity.label;
        }
        if(Object.getOwnPropertyNames(body.action).length !== 0)
        {
            data.action = body.action;
        }
        DocumentSchema.set('collection', identity.table);
        var collection = conn.model(identity.table, DocumentSchema);
        var mongoose_query;
        if(!body.rows || (body.rows && body.rows.length == 0) )   // Document without rows
        {
            if(identity.query)
            {
                mongoose_query = collection.find(identity.query, { _id: 0});
            }
            else
            {
                mongoose_query = collection.find({}, { _id: 0});
            }
            mongoose_query.setOptions({lean: true});
            if(identity.order)
            {
                if(identity.sortby)
                {
                    mongoose_query.sort({[identity.sortby]: identity.order == "asc" ? 1 : -1});
                }
                else
                {
                    // if not specified we don't know how to order
                }
            }
            else
            {
                if(identity.sortby)
                {
                    mongoose_query.sort({[identity.sortby]: 1});
                }
            }
            if(identity.populate)
            {
                if(Object.prototype.toString.call(identity.populate) === '[object Array]')
                {
                    identity.populate.forEach(function(item, i) {
                        mongoose_query.populate(item);
                    });
                }
                else
                {
                    mongoose_query.populate(identity.populate);
                }
            }
            mongoose_query.limit(1);    // take only one document
            mongoose_query.exec(function(err, result) {
                if (err)
                {
                    return cb(err, null);
                }
                if(result.length > 0)
                {
                    data.result = result;   // initialize the object to be filled with results
                    return cb(null, data);
                }
                else
                {
                    return cb(null, data);
                }
            });
        }
        else if(body.rows && body.rows.length > 0)    //Document with rows
        {
            if(identity.query)
            {
                mongoose_query = collection.find(identity.query, { _id: 0});
            }
            else
            {
                mongoose_query = collection.find({}, { _id: 0});
            }
            mongoose_query.setOptions({lean: true});
            var names = "";
            body.rows.forEach(function(row) {
                names += " " + row.name;
            });
            mongoose_query.select(names);
            if(identity.order)
            {
                if(identity.sortby)
                {
                    mongoose_query.sort({[identity.sortby]: identity.order == "asc" ? 1 : -1});
                }
                else
                {
                    mongoose_query.sort({[body.rows[0].name]: identity.order == "asc" ? 1 : -1});    // if not specified, sort by the first row attribute
                }
            }
            else
            {
                if(identity.sortby)
                {
                    mongoose_query.sort({[identity.sortby]: 1});
                }
            }
            if(identity.populate)
            {
                if(Object.prototype.toString.call(identity.populate) === '[object Array]')
                {
                    identity.populate.forEach(function(item, i) {
                        mongoose_query.populate(item);
                    });
                }
                else
                {
                    mongoose_query.populate(identity.populate);
                }
            }
            mongoose_query.limit(1);    // take only one document
            mongoose_query.exec(function(err, result) {
                if (err)
                {
                    return cb(err, null);
                }
                if(result.length > 0)
                {
                    data.result = [ {} ];   // initialize the object to be filled with results matching rows values
                    var i = 0;
                    var returned = false;
                    while(i < body.rows.length && !returned)
                    {
                        var row = body.rows[i];
                        var rowValue = result[0][row.name];
                        
                        data.types.push(row.type);
                        
                        if(row.transformation)
                        {
                            var transformedValue;
                            try
                            {
                                transformedValue = row.transformation(rowValue);
                            }
                            catch(err)
                            {
                                returned = true;
                                return cb(err, null);
                            }
                            AttributesReader.checkKeywordValue({ type: row.type, value: transformedValue }, function(keywordValueError) {
                                if(Object.getOwnPropertyNames(keywordValueError).length !== 0)
                                {
                                    returned = true;
                                    return cb(keywordValueError, null);
                                }
                                else
                                {
                                    if(row.label)
                                    {
                                        data.result[0][row.label] = transformedValue;
                                    }
                                    else
                                    {
                                        data.result[0][row.name] = transformedValue;
                                    }
                                    
                                    if(i == body.rows.length-1)  // if all rows are checked then returns
                                    {
                                        returned = true;
                                        return cb(null, data);
                                    }
                                    else    // if there are other rows to check
                                    {
                                        i++;
                                    }
                                }
                            });
                        }
                        else
                        {
                            AttributesReader.checkKeywordValue({ type: row.type, value: rowValue }, function(keywordValueError) {
                                if(Object.getOwnPropertyNames(keywordValueError).length !== 0)
                                {
                                    returned = true;
                                    return cb(keywordValueError, null);
                                }
                                else
                                {
                                    if(row.label)
                                    {
                                        data.result[0][row.label] = rowValue;
                                    }
                                    else
                                    {
                                        data.result[0][row.name] = rowValue;
                                    }
                                    
                                    if(i == body.rows.length-1)  // if all rows are checked then returns
                                    {
                                        returned = true;
                                        return cb(null, data);
                                    }
                                    else    // if there are other rows to check
                                    {
                                        i++;
                                    }
                                }
                            });
                        }
                    }
                }
                else
                {
                    return cb(null, data);
                }
            });
        }
    };
    
    DSL.remoteMethod(
        'executeDocument',
        {
            description: "Execute a Document macro",
            isStatic: true,
            accepts : [
                { arg: 'identity', type: 'Object', required: true, description: 'Document identity' },
                { arg: 'body', type: 'Object', required: true, description: 'Document body' }
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'data', type: 'Object' }
            ]
        }
    );
    
    /* -------------------------------- COLLECTION --------------------------------
    
    Two types of Collection:
    
    1)
        Identity:
            table | required
            label | optional
            sortby | optional
            query | optional
            order | optional
            perpage | optional
        Body:
            action | optional
            column | optional
        
    2)
        Identity:
            table | required
            label | optional
            sortby | optional
            query | optional
            order | optional
            perpage | optional
        Body:
            action | optional
            column | optional
            document
            
        Column:
            name | required
            selectable | optional | false
            sortable | optional | false
            type | required | false
            label | optional
            transformation | optional
            
    Two types of Document inside Collection (if defined):
    
    1)
        Identity:
            populate | optional
        Body:
            row
    Row:
        Identity:
            name | required
            label | optional
            transformation | optional
            type | required
            
    2)
        Identity:
            populate | optional
        Body:
            empty
        
    */
/*
Collection(
    table: "customers",
    label: "JuniorCustomers",
    ---------id: "Junior",
    ---------Weight:"0",
    perpage: "20",
    sortby: "surname",
    order: "asc",
    query: {age: {$lt: 40}}
) {
    column(
        name: "3"
    )
    action(
        Export: "true",
        SendEmail: "true"
    )
    column(
        name: "4"
    )
    Document(
        table: "prova"
    ){
        row(
            name: "asd"
        )
        action(
            SendEmail: "true"
        )
    }   
    column(
        name: "5"
    )
}
*/
    DSL.compileCollection = function(identity, columns, document, action, cb) {
        var body = {};
        body.definitionType = "Collection";
        AttributesReader.checkSupportedAttributes(identity, ['table', 'label', 'sortby', 'order', 'query', 'perpage', 'populate'], function(unsupportedIdentityAttributesError) {
            AttributesReader.readRequiredAttributes(identity, ['table'], function(missingRequiredIdentityAttributesError) {
                var keywords = {
                    table: identity.table,
                    label: identity.label,
                    sortby: identity.sortby,
                    order: identity.order,
                    query: identity.query,
                    perpage: identity.perpage,
                    populate: identity.populate
                };
                AttributesReader.checkKeywordValue(keywords, function(identityKeywordValueError) {
                    AttributesReader.checkSupportedAttributes(action, ['Export', 'SendEmail'], function(unsupportedActionAttributesError) {
                        AttributesReader.checkKeywordValue({Export: action.Export, SendEmail: action.SendEmail}, function(actionKeywordValueError) {
                            if(columns.length > 0)
                            {
                                var stop = false;
                                for (var i = 0; !stop && i< columns.length; i++)
                                {
                                    var column = columns[i];
                                    AttributesReader.checkSupportedAttributes(column, ['name', 'label', 'type', 'selectable', 'sortable', 'transformation'], function(unsupportedColumnAttributesError) {
                                        AttributesReader.readRequiredAttributes(column, ['name', 'type'], function(missingRequiredColumnAttributesError) {
                                            var keywords = {
                                                name: column.name,
                                                label: column.label,
                                                selectable: column.selectable,
                                                sortable: column.sortable,
                                                transformation: column.transformation
                                            };
                                            AttributesReader.checkKeywordValue(keywords, function(columnKeywordValueError) {
                                                var columnError;
                                                if (column.type.type && column.type.type == "image")
                                                {
                                                    AttributesReader.checkSupportedAttributes(column.type, ['height', 'width', 'type'], function(unsupportedImageAttributesError) {
                                                        AttributesReader.checkKeywordValue({ height: column.type.height, width: column.type.width}, function(keywordImageValueError) {
                                                            columnError = Object.assign(unsupportedColumnAttributesError, missingRequiredColumnAttributesError, columnKeywordValueError, unsupportedImageAttributesError, keywordImageValueError);
                                                        });
                                                    });
                                                }
                                                else if (column.type.type && column.type.type)
                                                {
                                                    AttributesReader.checkSupportedAttributes(column.type, ['label', 'type'], function(unsupportedLinkAttributesError) {
                                                        AttributesReader.checkKeywordValue({ label: column.type.label }, function(keywordLinkValueError) {
                                                            columnError = Object.assign(unsupportedColumnAttributesError, missingRequiredColumnAttributesError, columnKeywordValueError, unsupportedLinkAttributesError, keywordLinkValueError);
                                                        });
                                                    });
                                                }
                                                else
                                                {
                                                    columnError = Object.assign(unsupportedColumnAttributesError, missingRequiredColumnAttributesError, columnKeywordValueError);
                                                }
                                                var error = Object.assign(columnError, unsupportedIdentityAttributesError, missingRequiredIdentityAttributesError,
                                                identityKeywordValueError, unsupportedActionAttributesError, actionKeywordValueError);
                                                if(Object.getOwnPropertyNames(columnError).length !== 0)
                                                {
                                                    stop = true;
                                                    return cb(error, null, null);   // return the errors occurred in the first wrong column
                                                }
                                                else    // no column error
                                                {
                                                    if (i == columns.length-1)
                                                    {
                                                        if(Object.getOwnPropertyNames(document).length === 0)   // collection without explicit document
                                                        {
                                                            if(Object.getOwnPropertyNames(error).length !== 0)    // general errors from above
                                                            {
                                                                stop = true;
                                                                return cb(error, null, null);
                                                            }
                                                            else 
                                                            {
                                                                body.action = action;
                                                                body.columns = columns;
                                                                body.document = {};
                                                                stop = true;
                                                                return cb(null, identity, body);
                                                            }
                                                        }
                                                        else    // collection with explicit document
                                                        {
                                                            DSL.compileDocument(document.identity, document.rows, document.action, true, function(documentCompileError, documentIdentity, documentBody) {
                                                                error = Object.assign(error, documentCompileError); // general errors from above + document errors
                                                                if(Object.getOwnPropertyNames(error).length !== 0)
                                                                {
                                                                    stop = true;
                                                                    return cb(error, null, null);
                                                                }
                                                                else 
                                                                {
                                                                    body.action = action;
                                                                    body.columns = columns;
                                                                    body.document = {
                                                                        identity: documentIdentity,
                                                                        body: documentBody
                                                                    };
                                                                    stop = true;
                                                                    return cb(null, identity, body);
                                                                }
                                                            });
                                                        }
                                                    }
                                                }
                                            });
                                        });
                                    });
                                }
                            }
                            else
                            {
                                var error = Object.assign(unsupportedIdentityAttributesError, missingRequiredIdentityAttributesError,
                                                identityKeywordValueError, unsupportedActionAttributesError, actionKeywordValueError);
                                                
                                if(Object.getOwnPropertyNames(document).length === 0)   // collection without explicit document
                                {
                                    if(Object.getOwnPropertyNames(error).length !== 0)    // general errors from above
                                    {
                                        stop = true;
                                        return cb(error, null, null);
                                    }
                                    else 
                                    {
                                        body.action = action;
                                        body.columns = columns;
                                        body.document = {};
                                        stop = true;
                                        return cb(null, identity, body);
                                    }
                                }
                                else    // collection with explicit document
                                {
                                    DSL.compileDocument(document.identity, document.rows, document.action, true, function(documentCompileError, documentIdentity, documentBody) {
                                        error = Object.assign(error, documentCompileError); // general errors from above + document errors
                                        if(Object.getOwnPropertyNames(error).length !== 0)
                                        {
                                            stop = true;
                                            return cb(error, null, null);
                                        }
                                        else 
                                        {
                                            body.action = action;
                                            body.columns = columns;
                                            body.document = {
                                                identity: documentIdentity,
                                                body: documentBody
                                            };
                                            stop = true;
                                            return cb(null, identity, body);
                                        }
                                    });
                                }
                            }
                        });
                    });
                });
            });
        });
    };
    
    DSL.remoteMethod(
        'compileCollection',
        {
            description: "Compile a Collection macro",
            isStatic: true,
            accepts : [
                { arg: 'identity', type: 'Object', required: true, description: 'Collection identity' },
                { arg: 'columns', type: 'Object', required: true, description: 'Collection columns' },
                { arg: 'document', type: 'Object', required: true, description: 'Collection document' },
                { arg: 'action', type: 'Object', required: true, description: 'Collection action'}
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'identity', type: 'Object' },
                { arg: 'body', type: 'Object' }
            ]
        }
    );
    
    DSL.executeCollection = function(identity, body, conn, cb) {
        var data = {};
        data.perpage = identity.perpage;
        data.types = [];
        data.selectables = [];
        data.sortables = [];
        data.document = body.document;
        if(Object.getOwnPropertyNames(body.action).length !== 0)
        {
            data.action = body.action;
        }
        DocumentSchema.set('collection', identity.table);
        var collection = conn.model(identity.table, DocumentSchema);
        var mongoose_query;
        if(!body.columns || (body.columns && body.columns.length == 0) )   // Collection without columns
        {
            if(identity.query)
            {
                mongoose_query = collection.find(identity.query, { _id: 0});
            }
            else
            {
                mongoose_query = collection.find({}, { _id: 0});
            }
            mongoose_query.setOptions({lean: true});
            if(identity.order)
            {
                if(identity.sortby)
                {
                    mongoose_query.sort({[identity.sortby]: identity.order == "asc" ? 1 : -1});
                }
                else
                {
                    // if not specified we don't know how to order
                }
            }
            else
            {
                if(identity.sortby)
                {
                    mongoose_query.sort({[identity.sortby]: 1});
                }
            }
            if(identity.populate)
            {
                if(Object.prototype.toString.call(identity.populate) === '[object Array]')
                {
                    identity.populate.forEach(function(item, i) {
                        mongoose_query.populate(item);
                    });
                }
                else
                {
                    mongoose_query.populate(identity.populate);
                }
            }
            mongoose_query.exec(function(err, results) {
                if (err)
                {
                    return cb(err, null);
                }
                if(results.length > 0)
                {
                    data.rawData = true;
                    data.result = results;   // initialize the object to be filled with results
                    if(identity.label)
                    {
                        data.label = identity.label;
                    }
                    return cb(null, data);
                }
                else
                {
                    return cb(null, data);
                }
            });
        }
        else if(body.columns && body.columns.length > 0)    // Collection with columns
        {
            var found = false;
            for(var i = 0; !found && i < body.columns.length; i++)
            {
                if(body.columns[i].selectable && body.columns[i].selectable == true)
                {
                    found = true;
                }
            }
            if(found)   // found selectables in body
            {
                var raw_query;
                if(identity.query)
                {
                    raw_query = collection.find(identity.query, { _id: 0});
                }
                else
                {
                    raw_query = collection.find({}, { _id: 0});
                }
                raw_query.setOptions({lean: true});
                if(identity.order)
                {
                    if(identity.sortby)
                    {
                        raw_query.sort({[identity.sortby]: identity.order == "asc" ? 1 : -1});
                    }
                    else
                    {
                        raw_query.sort({[body.columns[0].name]: identity.order == "asc" ? 1 : -1});    // if not specified, sort by the first column attribute
                    }
                }
                else
                {
                    if(identity.sortby)
                    {
                        raw_query.sort({[identity.sortby]: 1});
                    }
                }
                raw_query.exec(function(err, rawResults) {
                    if (err)
                    {
                        return cb(err, null);
                    }
                    data.rawData = rawResults;
                });
            }
            
            if(identity.query)
            {
                mongoose_query = collection.find(identity.query, { _id: 0});
            }
            else
            {
                mongoose_query = collection.find({}, { _id: 0});
            }
            mongoose_query.setOptions({lean: true});
            var names = "";
            body.columns.forEach(function(column) {
                names += " " + column.name;
            });
            mongoose_query.select(names);
            if(identity.order)
            {
                if(identity.sortby)
                {
                    mongoose_query.sort({[identity.sortby]: identity.order == "asc" ? 1 : -1});
                }
                else
                {
                    mongoose_query.sort({[body.columns[0].name]: identity.order == "asc" ? 1 : -1});    // if not specified, sort by the first column attribute
                }
            }
            else
            {
                if(identity.sortby)
                {
                    mongoose_query.sort({[identity.sortby]: 1});
                }
            }
            if(identity.populate)
            {
                if(Object.prototype.toString.call(identity.populate) === '[object Array]')
                {
                    identity.populate.forEach(function(item, i) {
                        mongoose_query.populate(item);
                    });
                }
                else
                {
                    mongoose_query.populate(identity.populate);
                }
            }
            mongoose_query.exec(function(err, results) {
                if(err)
                {
                    return cb(err, null);
                }
                if(results.length > 0)
                {
                    data.result = [ {} ];   // initialize the object to be filled with results matching rows values
                    if(identity.label)
                    {
                        data.label = identity.label;
                    }
                    
                    var column;
                    for(var i = 0; i < body.columns.length; i++)
                    {
                        column = body.columns[i];
                        data.types.push(column.type);
                            
                        if(column.sortable)
                        {
                            data.sortables.push(column.sortable);
                        }
                        else
                        {
                            data.sortables.push(false);
                        }
                        
                        if(column.selectable)
                        {
                            data.selectables.push(column.selectable);
                        }
                        else
                        {
                            data.selectables.push(false);
                        }
                    }
                    
                    var returned = false;
                    for(var x = 0; !returned && x < results.length; x++)   // check all documents resulted form query
                    {
                        data.result[x] = {};
                        for(var i = 0; !returned && i < body.columns.length; i++)
                        {
                            column = body.columns[i];
                            var columnValue = results[x][column.name];
                            
                            if(column.transformation)
                            {
                                var transformedValue;
                                try
                                {
                                    transformedValue = column.transformation(columnValue);
                                }
                                catch(err)
                                {
                                    returned = true;
                                    return cb(err, null);
                                }
                                AttributesReader.checkKeywordValue({ type: column.type, value: transformedValue }, function(keywordValueError) {
                                    if(Object.getOwnPropertyNames(keywordValueError).length !== 0)
                                    {
                                        returned = true;
                                        return cb(keywordValueError, null);
                                    }
                                    else
                                    {
                                        if(column.label)
                                        {
                                            data.result[x][column.label] = transformedValue;
                                        }
                                        else
                                        {
                                            data.result[x][column.name] = transformedValue;
                                        }
                                    }
                                });
                            }
                            else
                            {
                                AttributesReader.checkKeywordValue({ type: column.type, value: columnValue }, function(keywordValueError) {
                                    if(Object.getOwnPropertyNames(keywordValueError).length !== 0)
                                    {
                                        returned = true;
                                        return cb(keywordValueError, null);
                                    }
                                    else
                                    {
                                        if(column.label)
                                        {
                                            data.result[x][column.label] = columnValue;
                                        }
                                        else
                                        {
                                            data.result[x][column.name] = columnValue;
                                        }
                                    }
                                });
                            }
                        }
                        if(x == results.length-1)
                        {
                            returned = true;
                            return cb(null, data);
                        }
                    }
                }
                else
                {
                    return cb(null, data);
                }
            });
        }
    };
    
    DSL.remoteMethod(
        'executeCollection',
        {
            description: "Execute a Collection macro",
            isStatic: true,
            accepts : [
                { arg: 'identity', type: 'Object', required: true, description: 'Collection identity' },
                { arg: 'body', type: 'Object', required: true, description: 'Collection body' }
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'data', type: 'Object' }
            ]
        }
    );
    
    /* -------------------------------- DASHBOARD --------------------------------
    
    Dashboard structure:
    
    Dashboard(
        label | optional
    ){
        row | optional
    }
    
    Row(
        Cell() | optional
        Document() | optional
        Collection() | optional
    )
    
    Example:
    
    Dashboard(
        label: "Dashboard"
    )
    {
        row(
            Document(
                table: "prova"
            )
            {
                row(
                    name: "email",
                    type: "string",
                    label: "Email"
                )
            }
            Document(
                table: "prova"
            ){
            }
        )
        row(
            Document(
                table: "prova"
            ){
            }
            Collection(
                table: "users"
            ){
            }
            Cell(
                type: "string"
            ){
            }
        )
        action(
            Export: "json"
        )
    }
    */
    
    DSL.compileDashboard = function(identity, rows, cb) {
        var body = {};
        body.definitionType = "Dashboard";
        body.rows = [];
        AttributesReader.checkSupportedAttributes(identity, ['label'], function(unsupportedIdentityAttributesError) {
            var error = Object.assign(unsupportedIdentityAttributesError, {});
            if(rows.length > 0)     // Dashboard with rows
            {
                var stop = false;
                for(var i = 0; !stop && i < rows.length; i++)
                {
                    var row = rows[i];      // each row is an array of DSL entities
                    body.rows.push([]);     // initialize the Dashboard row 
                    var dashboardRow = body.rows[i];    // take the reference to that row
                    for(var j = 0; !stop && j < row.length; j++)
                    {
                        var entity = row[j];
                        if(entity.type == "Cell")
                        {
                            DSL.compileCell(entity.identity, entity.body, function(cellCompileErrors, identity, body) {
                                if(cellCompileErrors)
                                {
                                    stop = true;
                                    error = Object.assign(error, cellCompileErrors);    // merge errors
                                    return cb(error, null, null);
                                }
                                else
                                {
                                    dashboardRow.push(
                                        {
                                            type: "Cell",
                                            identity: identity,
                                            body: body
                                        }
                                    );
                                }
                            });
                        }
                        else if(entity.type == "Document")
                        {
                            DSL.compileDocument(entity.identity, entity.rows, entity.action, false, function(documentCompileErrors, identity, body) {
                                if(documentCompileErrors)
                                {
                                    stop = true;
                                    error = Object.assign(error, documentCompileErrors);    // merge errors
                                    return cb(error, null, null);
                                }
                                else
                                {
                                    dashboardRow.push(
                                        {
                                            type: "Document",
                                            identity: identity,
                                            body: body
                                        }
                                    );
                                }
                            });
                        }
                        else if(entity.type == "Collection")
                        {
                            DSL.compileCollection(entity.identity, entity.columns, entity.document, entity.action, function(collectionCompileErrors, identity, body) {
                                if(collectionCompileErrors)
                                {
                                    stop = true;
                                    error = Object.assign(error, collectionCompileErrors);    // merge errors
                                    return cb(error, null, null);
                                }
                                else
                                {
                                    dashboardRow.push(
                                        {
                                            type: "Collection",
                                            identity: identity,
                                            body: body
                                        }
                                    );
                                }
                            });
                        }
                        if(!stop && i==rows.length-1 && j==row.length-1)  // last element
                        {
                            if(Object.getOwnPropertyNames(error).length !== 0)  // general errors from above
                            {
                                stop = true;
                                return cb(error, null, null);
                            }
                            else 
                            {
                                stop = true;
                                return cb(null, identity, body);
                            }
                        }
                    }
                    
                }
            }
            else     // Dashboard without rows
            {
                if(Object.getOwnPropertyNames(error).length !== 0)  // general errors from above
                {
                    return cb(error, null, null);
                }
                else 
                {
                    return cb(null, identity, body);
                }
            }
        });
    };
    
    DSL.remoteMethod(
        'compileDashboard',
        {
            description: "Compile a Dashboard macro",
            isStatic: true,
            accepts : [
                { arg: 'identity', type: 'Object', required: true, description: 'Dashboard identity' },
                { arg: 'rows', type: 'Object', required: true, description: 'Dashboard rows' },
                { arg: 'action', type: 'Object', required: true, description: 'Dashboard action'}
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'identity', type: 'Object' },
                { arg: 'body', type: 'Object' }
            ]
        }
    );
    
    DSL.executeDashboard = function(identity, body, conn, cb) {
        var data = {};
        data.rows = [];
        if(identity.label)
        {
            data.label = identity.label;
        }
        if(!body.rows || (body.rows && body.rows.length == 0) )   // Dashboard without rows
        {
            return cb(null, data);
        }
        else   // Dashboard with rows
        {
            DSL.syncLoop(body.rows.length, function(outerLoop) {
                var row = body.rows[outerLoop.iteration()];             // each row is an array of DSL entities
                data.rows.push([]);                                     // initialize the Dashboard row 
                var dashboardRow = data.rows[outerLoop.iteration()];    // take the reference to that row
                DSL.syncLoop(row.length, function(loop) {
                    var entity = row[loop.iteration()];
                    if(entity.type == "Cell")
                    {
                        DSL.executeCell(entity.identity, entity.body, conn, function(cellErrors, cellData) {
                            if(cellErrors)
                            {
                                return cb(cellErrors, null);
                            }
                            else
                            {
                                dashboardRow.push(
                                    {
                                        type: "Cell",
                                        data: cellData
                                    }
                                );
                            }
                            loop.next();
                        });
                    }
                    else if(entity.type == "Document")
                    {
                        DSL.executeDocument(entity.identity, entity.body, conn, function(documentErrors, documentData) {
                            if(documentErrors)
                            {
                                return cb(documentErrors, null);
                            }
                            else
                            {
                                dashboardRow.push(
                                    {
                                        type: "Document",
                                        data: documentData
                                    }
                                );
                            }
                            loop.next();
                        });
                    }
                    else if(entity.type == "Collection")
                    {
                        DSL.executeCollection(entity.identity, entity.body, conn, function(collectionErrors, collectionData) {
                            if(collectionErrors)
                            {
                                return cb(collectionErrors, null);
                            }
                            else
                            {
                                dashboardRow.push(
                                    {
                                        type: "Collection",
                                        data: collectionData
                                    }
                                );
                            }
                            loop.next();
                        });
                    }
                }, function() {
                    outerLoop.next();
                    
                });
            }, function() {
                return cb(null, data);
            });
        }
    };
    
    DSL.remoteMethod(
        'executeDashboard',
        {
            description: "Execute a Dashboard macro",
            isStatic: true,
            accepts : [
                { arg: 'identity', type: 'Object', required: true, description: 'Dashboard identity' },
                { arg: 'body', type: 'Object', required: true, description: 'Dashboard body' }
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'data', type: 'Object' }
            ]
        }
    );
    
    DSL.syncLoop = function syncLoop(iterations, process, exit){  
        var index = 0,
            done = false,
            shouldExit = false;
        var loop = {
            next:function(){
                if(done){
                    if(shouldExit && exit){
                        return exit();  // Exit if we're done
                    }
                }
                if(index < iterations){
                    index++;            // Increment our index
                    process(loop);      // Run our process, pass in the loop
                } else {
                    done = true;        // Make sure we say we're done
                    if(exit) exit();    // Call the callback on exit
                }
            },
            iteration:function(){
                return index - 1;       // Return the loop number we're on
            },
            break:function(end){
                done = true;            // End the loop
                shouldExit = end;       // Passing end as true means we still call the exit callback
            }
        };
        loop.next();
        return loop;
    };
    
    
    DSL.remoteMethod(
        'syncLoop',
        {
            description: "Handling Asynchronous Loops",
            isStatic: true,
            accepts : [
                { arg: 'iterations', type: 'Number', required: true, description: 'the number of iterations to carry out' },
                { arg: 'process', type: 'Object', required: true, description: 'the code/function we\'re running for every iteration' },
                { arg: 'exit', type: 'Object', required: true, description: 'an optional callback to carry out once the loop has completed' }
            ],
            returns: [
                { arg: 'loop', type: 'Object' }
            ]
        }
    );
    
};