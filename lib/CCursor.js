(function () {
  'use strict';

  var _ = require('lodash');
  var util = require('util');
  var debug = require('debug')('jshs2:CCursor');

  var ExecutionError = require('./Common/HS2Error').ExecutionError;
  var OperationError = require('./Common/HS2Error').OperationError;
  var FetchError = require('./Common/HS2Error').FetchError;
  var IdlContainer = require('./Common/IdlContainer');
  var hs2util = require('./Common/HS2Util');
  var Cursor = require('./Cursor');

  function CCursor (connection) {
    Cursor.call(this, connection);
  }

  util.inherits(CCursor, Cursor);

  CCursor.prototype.cancel = function cancel (callback) {
    var that = this;
    var serviceType = IdlContainer.getServiceType();
    var client = that.getClient();

    var req = new serviceType.TCancelOperationReq({
      operationHandle: that.getOperationHandle()
    });

    client.CancelOperation(req, function (err, res) {
      if (err) {
        callback(new OperationError(err.message || 'cancel fail, unknown error'));
      } else if (res.status.statusCode === serviceType.TStatusCode.ERROR_STATUS) {
        callback(new OperationError(res.status.errorMessage || 'cancel fail, unknown error'));
      } else {
        callback(null, true);
      }
    });
  };

  CCursor.prototype.execute = function execute (hql, callback) {
    var that = this;
    var serviceType = IdlContainer.getServiceType();
    var client = that.getClient();

    var req = new serviceType.TExecuteStatementReq({
      sessionHandle: that.getSessionHandle(),
      statement: hql,
      runAsync: true
    });

    debug('ExecuteStatement start -> async, ', hql);

    client.ExecuteStatement(req, function (err, res) {
      if (err) {
        debug('execute statement:Error, statusCode error');
        callback(new ExecutionError(err.message + '\n Error caused from HiveServer2'));
      } else if (res.status.statusCode === serviceType.TStatusCode.ERROR_STATUS) {
        debug('ExecuteStatement -> Error from HiveServer2\n', res.status.infoMessages);
        debug('ExecuteStatement -> Error from HiveServer2\n', res.status.errorMessage);

        callback(new OperationError([
          res.status.errorMessage,
          res.status.infoMessages,
          '-- Error caused from HiveServer2'
        ].join('\n\n')));
      } else {
        that.setOperationHandle(res.operationHandle);
        that.setHasResultSet(res.operationHandle.hasResultSet);

        callback(null, { hasResultSet: that.getHasResultSet() });
      }
    });
  };

  CCursor.prototype.getLog = function getLog (callback) {
    var that = this;
    var funcName = this.getLogFactory();

    debug('getLog, selected function name ->', funcName);

    if (funcName) {
      return that[funcName].call(that, callback);
    } else {
      return callback(new OperationError('Not implementation getLog or Not support'));
    }
  };

  CCursor.prototype.getLogOnCDH = function getLogOnCDH (callback) {
    var that = this;

    if (!that.getOperationHandle()) {
      return reject(new OperationError('Invalid operationHandle in GetLog, on CDH'));
    }

    var serviceType = IdlContainer.getServiceType();
    var client = that.getClient();

    var req = new serviceType.TGetLogReq({
      operationHandle: that.getOperationHandle()
    });

    client.GetLog(req, function (err, res) {
      if (err) {
        callback(err);
      } else if (res.status.statusCode === serviceType.TStatusCode.ERROR_STATUS) {
        debug('GetLog -> Error from HiveServer2\n', res.status.infoMessages);
        debug('GetLog -> Error from HiveServer2\n', res.status.errorMessage);

        callback(new OperationError([
          res.status.errorMessage,
          res.status.infoMessages,
          '-- Error caused from HiveServer2'
        ].join('\n\n')));
      } else {
        callback(null, res.log);
      }
    });
  };

  CCursor.prototype.getLogOnHive = function getLogOnHive (callback) {
    var that = this;

    if (!that.getOperationHandle()) {
      return reject(new OperationError('Invalid operationHandle in GetLog, on Hive'));
    }

    var serviceType = IdlContainer.getServiceType();
    var client = that.getClient();

    var req = new serviceType.TFetchResultsReq({
      operationHandle: that.getOperationHandle(),
      orientation: serviceType.TFetchOrientation.FETCH_NEXT,
      maxRows: that.getConfigure().getMaxRows(),
      fetchType: hs2util.FETCH_TYPE.LOG
    });

    client.FetchResults(req, function (err, res) {
      if (err) {
        callback(err);
      } else if (res.status.statusCode === serviceType.TStatusCode.ERROR_STATUS) {
        debug('FetchResults(LOG, type-1) -> Error from HiveServer2\n', res.status.infoMessages);
        debug('FetchResults(LOG, type-1) -> Error from HiveServer2\n', res.status.errorMessage);

        callback(new OperationError([
          res.status.errorMessage,
          res.status.infoMessages,
          '-- Error caused from HiveServer2'
        ].join('\n\n')));
      } else {
        var firstColumn = _(res.results.columns).first();

        if (!firstColumn) {
          callback(null, 'HiveServer2 not response log');
        } else {
          callback(null, firstColumn.stringVal.values.join('\n'));
        }
      }
    });
  };

  CCursor.prototype.getOperationStatus = function getOperationStatus (callback) {
    var that = this;

    debug('GetOperationStatus -> function start');

    if (!that.getOperationHandle()) {
      return reject(new OperationError('Invalid operationHandle in getOperationStatus'));
    }

    var serviceType = IdlContainer.getServiceType();
    var client = that.getClient();

    var req = new serviceType.TGetOperationStatusReq({
      operationHandle: that.getOperationHandle()
    });

    debug('GetOperationStatus -> request start');

    client.GetOperationStatus(req, function (err, res) {
      debug('GetOperationStatus -> server response');

      if (err) {
        debug('GetOperationStatus -> Error(', err.message, ')');
        callback(err);
      } else if (res.status.statusCode === serviceType.TStatusCode.ERROR_STATUS) {
        debug('GetOperationStatus -> Error from HiveServer2\n', res.status.infoMessages);
        debug('GetOperationStatus -> Error from HiveServer2\n', res.status.errorMessage);

        callback(new OperationError([
          res.status.errorMessage,
          res.status.infoMessages,
          '-- Error caused from HiveServer2'
        ].join('\n\n')));
      } else {
        callback(null, res.operationState);
      }
    });
  };

  CCursor.prototype.getSchema = function getSchema (callback) {
    var that = this;

    debug('GetSchema -> function start');

    if (!that.getOperationHandle()) {
      return reject(new OperationError('Invalid operationHandle in getOperationStatus'));
    }

    var serviceType = IdlContainer.getServiceType();
    var client = that.getClient();

    var req = new serviceType.TGetResultSetMetadataReq({
      operationHandle: that.getOperationHandle()
    });

    client.GetResultSetMetadata(req, function (err, res) {
      if (err) {
        callback(err);
      } else if (res.status.statusCode === serviceType.TStatusCode.ERROR_STATUS) {
        debug('GetResultSetMetadata -> Error from HiveServer2\n', res.status.infoMessages);
        debug('GetResultSetMetadata -> Error from HiveServer2\n', res.status.errorMessage);

        callback(new OperationError([
          res.status.errorMessage,
          res.status.infoMessages,
          '-- Error caused from HiveServer2'
        ].join('\n\n')));
      } else {
        if (res.schema) {
          callback(null, _.map(res.schema.columns, function (column) {
            return {
              type: hs2util.getType(serviceType, column.typeDesc),
              columnName: column.columnName,
              comment: column.comment
            };
          }));
        } else {
          callback(null);
        }
      }
    });
  };

  CCursor.prototype.fetchBlock = function fetchBlock (callback) {
    var that = this;

    debug('FetchBlock -> function start');

    if (!that.getOperationHandle()) {
      return reject(new OperationError('Invalid operationHandle in fetchBlock'));
    }

    var serviceType = IdlContainer.getServiceType();
    var client = that.getClient();

    var req = new serviceType.TFetchResultsReq({
      operationHandle: that.getOperationHandle(),
      orientation: serviceType.TFetchOrientation.FETCH_NEXT,
      maxRows: that.getConfigure().getMaxRows(),
      fetchType: hs2util.FETCH_TYPE.ROW
    });

    debug('FetchBlock -> request start');

    client.FetchResults(req, function (err, res) {
      debug('FetchBlock -> request responsed');

      if (err) {
        debug('FetchBlock -> response error, ', err.message);
        callback(err);
      } else if (res.status.statusCode === serviceType.TStatusCode.ERROR_STATUS) {
        debug('FetchBlock -> Error from HiveServer2\n', res.status.infoMessages);
        debug('FetchBlock -> Error from HiveServer2\n', res.status.errorMessage);

        callback(new OperationError([
          res.status.errorMessage,
          res.status.infoMessages,
          '-- Error caused from HiveServer2'
        ].join('\n\n')));
      } else {
        try {
          if (!that.getTypeCache()) {
            that.setTypeCache(hs2util.makeStoredType(res.results));
          }

          var typeCache = that.getTypeCache();
          var firstColumn = _(res.results.columns).first();
          var firstType = _(typeCache).first();
          var fetchLength = firstColumn[firstType].values.length;

          debug('HiveServer2 1.2.x under, not support hasMoreRows');
          debug('FetchBlock -> hasMoreRows: ', res.hasMoreRows);

          if (!!fetchLength) {
            return callback(null, {
              hasMoreRows: !!fetchLength,
              rows: hs2util.makeArray(that.getConfigure(), typeCache, res.results.columns)
            });
          } else {
            that.setTypeCache(null);
            return callback(null, {
              hasMoreRows: !!fetchLength,
              rows: []
            });
          }
        } catch (err) {
          callback(new FetchError(err.message));
        }
      }
    });
  };

  CCursor.prototype.close = function close (callback) {
    var that = this;

    debug('CloseOperation -> function start');

    if (!that.getOperationHandle()) {
      return reject(new OperationError('Invalid operationHandle in CloseOperation'));
    }

    var serviceType = IdlContainer.getServiceType();
    var client = that.getClient();

    var req = new serviceType.TCloseOperationReq({
      operationHandle: that.getOperationHandle()
    });

    client.CloseOperation(req, function (err, res) {
      if (err) {
        debug('CloseOperation -> response error, ', err.message);
        callback(err);
      } else if (res.status.statusCode === serviceType.TStatusCode.ERROR_STATUS) {
        debug('CloseOperation -> Error from HiveServer2\n', res.status.infoMessages);
        debug('CloseOperation -> Error from HiveServer2\n', res.status.errorMessage);

        callback(new OperationError([
          res.status.errorMessage,
          res.status.infoMessages,
          '-- Error caused from HiveServer2'
        ].join('\n\n')));
      } else {
        callback(null);
      }
    });
  };

  module.exports = CCursor;
})();