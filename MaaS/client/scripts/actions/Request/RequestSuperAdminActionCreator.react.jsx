// Name: {RequestSuperAdminActionCreator.react.jsx}
// Module: {ActionsCreators}
// Location: {/MaaS/clientscripts/actions/Request/}

// History:
// Version         Date            Programmer
// ==========================================



var Dispatcher = require("../../dispatcher/Dispatcher.js");
var WebAPIUtils = require("../../utils/SuperAdminWebAPIUtils.js");
var Constants = require("../../constants/Constants.js");

var ActionTypes = Constants.ActionTypes;

var RequestSuperAdminActionCreator = {
    
    
    deleteCompany: function(id, email){
        WebAPIUtils.deleteCompany(id, email);
    },
    
    changeCompanyName: function(companyId, name){
        WebAPIUtils.changeCompanyName(companyId, name);
    }
    
};

module.exports = RequestSuperAdminActionCreator;