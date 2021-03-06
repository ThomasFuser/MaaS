var Dispatcher = require('../dispatcher/Dispatcher.js');
var Constants = require('../constants/Constants.js');
var EventEmitter = require('events').EventEmitter;
var assign = require('object-assign');
//var SessionStore = require('./SessionStore.react.jsx');

var ActionTypes = Constants.ActionTypes;
var CHANGE_EVENT = 'change';
var DELETE_EVENT = 'delete';


var _company = {
    id: localStorage.getItem('companyId'),
    name: localStorage.getItem('companyName'),
};
var _users = [];    // users of the company
var _companies = JSON.parse(localStorage.getItem('companies')); //all companies in the system
var databasesCount = localStorage.getItem('databasesCount');
var DSLDefinitionsCount = localStorage.getItem('DSLDefinitionsCount');
var _errors = [];

var CompanyStore = assign({}, EventEmitter.prototype, {

    emitChange: function() {
        this.emit(CHANGE_EVENT);
    },
    
    emitDelete: function() {
        this.emit(DELETE_EVENT);
    },

    addChangeListener: function(callback) {
        this.on(CHANGE_EVENT, callback);
    },

    removeChangeListener: function(callback) {
        this.removeListener(CHANGE_EVENT, callback);
    },
    
    addDeleteListener: function(callback) {
        this.on(DELETE_EVENT, callback);
    },

    removeDeleteListener: function(callback) {
        this.removeListener(DELETE_EVENT, callback);
    },

    getId: function() {
        return _company.id;
    },

    getName: function() {
        return _company.name;
    },

    getUsers: function() {
        return _users;
    },
    
    getCompanies: function(){
        return _companies;
    },

    getErrors: function() {
        return _errors;
    },
    
    getDatabasesCount: function() {
        return databasesCount;
    },
    
    getDSLDefinitionCount: function() {
        return DSLDefinitionsCount;
    }

});

CompanyStore.dispatchToken = Dispatcher.register(function(payload) {
    var action = payload.action;

    switch(action.type) {

        case ActionTypes.GET_COMPANY:
            if(action.errors)
            {
                _errors = action.errors;
            }
            else if(action.json)
            {
                _errors = []; // empty old errors
                // set company data
                _company.id = action.json.id;
                _company.name = action.json.name;
                localStorage.setItem('companyId', _company.id);
                localStorage.setItem('companyName', _company.name);
            }
            CompanyStore.emitChange();
            break;

        case ActionTypes.GET_USERS:
            if(action.errors)
            {
                _errors = action.errors;
            }
            else if(action.json)
            {
                _errors = []; // empty old errors
                // set users of the company
                _users = action.json;
            }
            CompanyStore.emitChange();
            break;
            
        case ActionTypes.DELETE_USER:
            if(action.errors)
            {
                _errors = action.errors;
            }
            else
            {
                var email = action.email;
                var index;
                _users.forEach(function(user, i) {
                    if(user.email == email)
                    {
                        index = i;
                    }
                });
                _users.splice(index, 1);
            }
            CompanyStore.emitChange();
            break;
            
        case ActionTypes.DELETE_COMPANY:
            if(action.errors)
            {
                _errors = action.errors;
            }
            else
            {
                _errors = [];
                var i = 0;
                var trovato = false;
                if(_companies)
                {
                    while(!trovato && i < _companies.length)
                    {
                        if (_companies[i].id == action.id)
                        {
                            trovato = true;
                            _companies.splice(i, 1);
                        }
                        i++;
                    }
                }
            }
            CompanyStore.emitChange();
            CompanyStore.emitDelete();
            break;
        case ActionTypes.DELETE_ALL_SELECTED_COMPANIES_RESPONSE:
            if(action.errors)
            {
              _errors.push(action.errors);
            }
            else
            {
                _errors = [];
                var count = 0;
                for (var i = 0; count < action.arrayId.length && i <_companies.length; i++)
                {
                    for (var j = 0; j < action.arrayId.length; j++)
                    {
                        if(_companies[i].id == action.arrayId[j])
                        {
                            _companies.splice(i,1);
                            count++;
                        }
                    }
                }
            }
            CompanyStore.emitChange();
            break;
            
        case ActionTypes.COMPANIES:     //get companies
            if(action.errors)
            {
                _errors = action.errors;
            }
            else if(action.json)
            {
                _errors = []; // empty old errors
                _companies = action.json;
                localStorage.setItem('companies', JSON.stringify(_companies));
            }
            CompanyStore.emitChange();
            break;
        
        case ActionTypes.CHANGE_COMPANY_NAME_RESPONSE:
            if(action.errors)
            {
                _errors = action.errors;
            }
            else
            {
                _errors = [];
                //Correction of the list containing the System companies
                let i = 0;
                while(i < _companies.length && _companies[i].name != action.data.oldName)
                    i++;
                _companies[i].name = action.data.newName;
            }
            CompanyStore.emitChange();
            break;
            
        case ActionTypes.GET_DATABASES_COUNT:
            if (action.errors)
            {
                _errors = action.errors;
            }
            else
            {
                _errors = [];
                databasesCount = action.count;
                localStorage.setItem('databasesCount', databasesCount);
            }
            CompanyStore.emitChange();
            break;
            
        case ActionTypes.GET_DSLDEFINITION_COUNT:
            if (action.errors)
            {
                _errors = action.errors;
            }
            else
            {
                _errors = [];
                DSLDefinitionsCount = action.count;
                localStorage.setItem('DSLDefinitionsCount', DSLDefinitionsCount);
            }
            CompanyStore.emitChange();
            break;
            case ActionTypes.LEAVE_IMPERSONATE:
                 _company.id = null;
                 _company.name = null;
                 databasesCount = null;
                 DSLDefinitionsCount = null;
                 localStorage.removeItem('databasesCount');
                 localStorage.removeItem('DSLDefinitionsCount');  
                 localStorage.removeItem('companyName');
                 localStorage.removeItem('companyId');  
            break;
    }

    return true;  // richiesto dal Promise nel Dispatcher
});

module.exports = CompanyStore;