// Name: {company.js}
// Module: {Back-end::Models}
// Location: {/MaaS/common/models/}

// History:
// Version         Date            Programmer
// ==========================================

var app = require('../../server/server.js');
var mongoose = require('mongoose');

module.exports = function(Company) {
    
    // Elimino l'azienda e i relativi utenti
    Company.deleteCompany = function(id, email, cb) {      
        Company.findById(id, function(err, company) {
            if(err || !company)
                return cb(err);
            var user = app.models.user;
            user.findOne({where: {companyId: company.id, email: email}, limit: 1}, function(err, userInstance) {
                if(err || !userInstance)
                    return cb(err);
                if(userInstance.role != "Owner" && company.owner == userInstance) {
                    var error = {
                        message: 'You haven\'t the rights to delete this company'
                    };
                    return cb(null, error);
                } 
                      
                userInstance.dsl.destroyAll( function(err) {
                    if (err)
                    {
                        console.log("> error deleting dsl: ",err);
                        return cb(err);
                    }
                });
           
               //Remove databases of the company
                company.externalDatabases.destroyAll(function(err) {
                    if (err)
                    {
                        console.log("> error deleting databases: ",err);
                        return cb(err);
                    }
                    console.log("> databases deleted");
                });
          
                //Remove Users of the company
                company.users.destroyAll(function(err) {
                    if(err)
                        return cb(err);
                    Company.deleteById(company.id, function(err) {
                        if(err) console.log("> error deleting company:", company.name);
                        console.log("> company deleted:", company.id);
                        return cb(null, null, company.id);
                    });
                });
            });
        });
        
    };
    
     Company.remoteMethod(
        'deleteCompany',
        {
            description: 'Delete Company by passing id to delete and email of the user making the request.',
            accepts: [
                { arg: 'id', type: 'string', required: true, description: 'Company id to delete'},
                { arg: 'email', type: 'string', required: true, description: 'User email making request'}
            ],
            returns: [
                {arg: 'error', type: 'Object'},
                {arg: 'id', type: 'String'}
            ],
            http: { verb: 'delete', path: '/deleteCompany/:id' }
        }
    );
                
                /*
               
                
                
                // Remove DSL of the company
                var DSL = app.models.DSL;
                userInstance.dsl({ where: {} }, function(err, DSLList) {
                    if(err || !DSLList)
                    {
                        return cb(err);
                    }
                    // Remove DSL accesses
                    DSLList.forEach(function(DSLInstance, i) {
                        
                        DSLInstance.users({ where: {} }, function(err, users) {
                            if(err)
                            {
                                return cb(err, null);
                            }
                            
                        users.forEach(function(user, i) {
                         // QUESTO NON FUNZIONA  ==> NON ENTRA QUI   
                            DSLInstance.users.remove(user, function(err) {
                                if(err) 
                                {
                                    console.log("> Error deleting DSL definition");
                                    return cb(err, null);
                                }
                                 console.log(">eliminazione dei permessi");
                            });
                            
                        });
    
                            DSL.destroyById(DSLInstance.id, function(err) {
                                console.log("> sto per distruggere un dsl");
                                if(err) 
                                {
                                    return cb(err, null);
                                }
                                console.log("> DSL definition deleted:", id);
                                //return cb(null, null);
                            });
                        });
                    });
                });
                
                
                */
                
                

   
    
    //checks if the connection string points to a real mongodb database
    Company.beforeRemote('__create__externalDatabases', function(context, extDbInstance, next){
        var connString = context.args.data.connString;
        console.log('> connection string: ', connString);
        mongoose.connect(connString);
        var db = mongoose.connection;
        db.on('error', function(){
            console.log('> connection error for the connection string: ', connString);
            context.args.data.connected = "false";
        });
    });
    //change name of a company wich as companyId= id 
    Company.changeCompanyName = function(id, name, cb){
        Company.findById(id, function(err, company) {
            if(err)
                return cb(err);
           Company.findOne({where: {name: name}, limit: 1}, function(err, companyInstance) {
                if(!companyInstance){
                    var oldName = company.name;
                    company.updateAttribute('name', name, function(err, company) {
                        if(err) {
                          console.log('> Failed changing name');
                          return cb(err);
                        }
                          console.log('> Name changed successfully');
                          var data = {
                              newName: company.name,
                              oldName: oldName
                          };
                          return cb(null, null, data);   
                    });
                }else{
                    var error = { message: 'A company with this name already exists' };
                    return cb(null, error);   
                }
            });
        });
    };
    
Company.remoteMethod(
        'changeCompanyName',
        {
            description: "Change the name of a company",
            accepts: [
                { arg: 'id', type: 'string', required: true, description: 'Company id' },
                { arg: 'name', type: 'string', required: true, description: 'New name' },
                
            ],
            returns: [
                { arg: 'error', type: 'Object' },
                { arg: 'data', type: 'Object'},
            ],
            http: { verb: 'put', path: '/:id/changeCompanyName' }
        }
    );

};
