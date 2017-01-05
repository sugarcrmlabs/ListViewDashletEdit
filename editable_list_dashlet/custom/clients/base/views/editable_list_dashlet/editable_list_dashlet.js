({
    extendsFrom: 'RecordlistView',
    plugins: ['MergeDuplicates', 'Dashlet', 'Pagination', 'Editable', 'MassCollection', 'ErrorDecoration'],
    fallbackFieldTemplate: 'list',
    _defaultSettings: {limit: 5, filter_id: 'assigned_to_me', intelligent: '0'},
    moduleBlacklist: ['Home', 'Forecasts', 'ProductCategories', 'ProductTemplates'],
    additionalModules: {'Project': ['ProjectTask']},
    _availableModules: {},
    _availableColumns: {},
    intelligent: null,
    moduleIsAvailable: true,
    initialize: function (options) {
        this.checkIntelligence();
        this._super('initialize', [options]);
        this.collection = this.collection || app.data.createBeanCollection('Accounts');
        this.context.set('collection', this.collection);

        this.leftColumns = [];
        this.leftColumns.push({
            type: 'editablelistbutton',
            label: 'LBL_CANCEL_BUTTON_LABEL',
            name: 'inline-cancel',
            css_class: 'btn-link btn-invisible inline-cancel'
        });
        this._noAccessTemplate = app.template.get(this.name + '.noaccess');
    },

    editClicked: function (model, field) {
        if (!_.isUndefined(field)) {
            this._super('editClicked', [model, field]);
        } else {
            this.layout.editDashlet();
        }
    },

    checkIntelligence: function () {
        var isIntelligent = app.controller.context.get('layout') === 'record' && !_.contains(this.moduleBlacklist, app.controller.context.get('module'));
        this.intelligent = isIntelligent ? '1' : '0';
        return this.intelligent;
    },
    setLinkedFieldVisibility: function (visible, intelligent) {
        var field = this.getField('linked_fields'), fieldEl;
        if (!field) {
            return;
        }
        intelligent = (intelligent === false || intelligent === '0') ? '0' : '1';
        fieldEl = this.$('[data-name=linked_fields]');
        if (visible === '1' && intelligent === '1' && !_.isEmpty(field.items)) {
            fieldEl.show();
        } else {
            fieldEl.hide();
        }
    },
    initDashlet: function (view) {
        if (this.meta.config) {
            this.settings.on('change:module', function (model, moduleName) {
                var label = (model.get('filter_id') === 'assigned_to_me') ? 'TPL_DASHLET_MY_MODULE' : 'LBL_MODULE_NAME';
                model.set('label', app.lang.get(label, moduleName, {module: app.lang.getModuleName(moduleName, {plural: true})}));
                this.dashModel.set('module', moduleName);
                this.dashModel.set('filter_id', 'assigned_to_me');
                this.layout.trigger('dashlet:filter:reinitialize');
                this._updateDisplayColumns();
                this.updateLinkedFields(moduleName);
            }, this);
            this.settings.on('change:intelligent', function (model, intelligent) {
                this.setLinkedFieldVisibility('1', intelligent);
            }, this);
            this.on('render', function () {
                var isVisible = !_.isEmpty(this.settings.get('linked_fields')) ? '1' : '0';
                this.setLinkedFieldVisibility(isVisible, this.settings.get('intelligent'));
            }, this);
        }
        this._initializeSettings();

        var _generateMeta = function(label, css_class, buttons) {
            return {
                'type': 'fieldset',
                'fields': [
                    {
                        'type': 'rowactions',
                        'label': label || '',
                        'css_class': css_class,
                        'buttons': buttons || []
                    }
                ],
                'value': false,
                'sortable': false
            };
        };

        this.rightColumns = [];
        var def = this.dashletConfig.rowactions;
        this.rightColumns.push(_generateMeta(def.label, def.css_class, def.actions));
        
        this.metaFields = this._getColumnsForDisplay();
        if (this.settings.get('intelligent') == '1') {
            var link = this.settings.get('linked_fields'), model = app.controller.context.get('model'), module = this.settings.get('module'), options = {
                link: {
                    name: link,
                    bean: model
                }, relate: true
            };
            this.collection = app.data.createBeanCollection(module, null, options);
            this.context.set('collection', this.collection);
            this.context.set('link', link);
        } else {
            this.context.unset('link');
        }
        this.before('render', function () {
            if (!this.moduleIsAvailable) {
                this.$el.html(this._noAccessTemplate());
                return false;
            }
        });
        if (this.meta.config) {
            this._configureDashlet();
            this.listenTo(this.layout, 'init', this._addFilterComponent);
            this.listenTo(this.layout.context, 'filter:add', this.updateDashletFilterAndSave);
            this.layout.before('dashletconfig:save', function () {
                this.saveDashletFilter();
                return false;
            }, this);
        } else if (this.moduleIsAvailable) {
            var filterId = this.settings.get('filter_id');
            if (!filterId || this.meta.preview) {
                this._displayDashlet();
                return;
            }
            var filters = app.data.createBeanCollection('Filters');
            filters.setModuleName(this.settings.get('module'));
            filters.load({
                success: _.bind(function () {
                    if (this.disposed) {
                        return;
                    }
                    var filter = filters.collection.get(filterId);
                    var filterDef = filter && filter.get('filter_definition');
                    this._displayDashlet(filterDef);
                }, this), error: _.bind(function (err) {
                    if (this.disposed) {
                        return;
                    }
                    this._displayDashlet();
                }, this)
            });
        }
    },
    showMoreRecords: function () {
        this.getNextPagination();
    },
    getLabel: function () {
        var module = this.settings.get('module') || this.context.get('module'), moduleName = app.lang.getModuleName(module, {plural: true});
        return app.lang.get(this.settings.get('label'), module, {module: moduleName});
    },
    saveDashletFilter: function () {
        var context = this.layout.context;
        if (context.editingFilter) {
            if (!context.editingFilter.get('name')) {
                context.editingFilter.set('name', app.lang.get('LBL_DASHLET') + ': ' + this.settings.get('label'));
            }
            context.trigger('filter:create:save');
        } else {
            var filterId = context.get('currentFilterId'), obj = {id: filterId};
            this.updateDashletFilterAndSave(obj);
        }
    },
    updateDashletFilterAndSave: function (filterModel) {
        var id = filterModel.id || filterModel.get('id');
        this.settings.set('filter_id', id);
        this.dashModel.set('filter_id', id);
        var componentType = this.dashModel.get('componentType') || 'view';
        if (!this.dashModel.get('componentType')) {
            this.dashModel.set('componentType', componentType);
        }
        app.drawer.close(this.dashModel);
        app.events.trigger('dashlet:filter:save', this.dashModel.get('module'));
    },
    _initializeSettings: function () {
        if (this.intelligent === '0') {
            _.each(this.dashletConfig.panels, function (panel) {
                panel.fields = panel.fields.filter(function (el) {
                    return el.name !== 'intelligent';
                });
            }, this);
            this.settings.set('intelligent', '0');
            this.dashModel.set('intelligent', '0');
        } else {
            if (_.isUndefined(this.settings.get('intelligent'))) {
                this.settings.set('intelligent', this._defaultSettings.intelligent);
            }
        }
        this.setLinkedFieldVisibility('1', this.settings.get('intelligent'));
        if (!this.settings.get('limit')) {
            this.settings.set('limit', this._defaultSettings.limit);
        }
        if (!this.settings.get('filter_id')) {
            this.settings.set('filter_id', this._defaultSettings.filter_id);
        }
        this._setDefaultModule();
        if (!this.settings.get('label')) {
            this.settings.set('label', 'LBL_MODULE_NAME');
        }
    },
    _setDefaultModule: function () {
        var availableModules = _.keys(this._getAvailableModules()), module = this.settings.get('module') || this.context.get('module');
        if (_.contains(availableModules, module)) {
            this.settings.set('module', module);
        } else if (this.meta.config) {
            module = this.context.parent.get('module');
            if (_.contains(this.moduleBlacklist, module)) {
                module = _.first(availableModules);
            }
            this.settings.set('module', module);
        } else {
            this.moduleIsAvailable = false;
        }
    },
    _updateDisplayColumns: function () {
        var availableColumns = this._getAvailableColumns(), columnsFieldName = 'display_columns', columnsField = this.getField(columnsFieldName);
        if (columnsField) {
            columnsField.items = availableColumns;
        }
        this.settings.set(columnsFieldName, _.keys(availableColumns));
    },
    updateLinkedFields: function (moduleName) {
        var linked = this.getLinkedFields(moduleName), displayColumn = this.getField('linked_fields'), intelligent = this.dashModel.get('intelligent');
        if (displayColumn) {
            displayColumn.items = linked;
            this.setLinkedFieldVisibility('1', intelligent);
        } else {
            this.setLinkedFieldVisibility('0', intelligent);
        }
        this.settings.set('linked_fields', _.keys(linked)[0]);
    },
    getLinkedFields: function (moduleName) {
        var fieldDefs = app.metadata.getModule(this.layout.module).fields;
        var relates = _.filter(fieldDefs, function (field) {
            if (!_.isUndefined(field.type) && (field.type === 'link')) {
                if (app.data.getRelatedModule(this.layout.module, field.name) === moduleName) {
                    return true;
                }
            }
            return false;
        }, this), result = {};
        _.each(relates, function (field) {
            result[field.name] = app.lang.get(field.vname || field.name, [this.layout.module, moduleName]);
        }, this);
        return result;
    },
    _configureDashlet: function () {
        var availableModules = this._getAvailableModules(), availableColumns = this._getAvailableColumns(), relates = this.getLinkedFields(this.module);
        _.each(this.getFieldMetaForView(this.meta), function (field) {
            switch (field.name) {
                case'module':
                    field.options = availableModules;
                    break;
                case'display_columns':
                    field.options = availableColumns;
                    break;
                case'linked_fields':
                    field.options = relates;
                    break;
            }
        });
    },
    _addFilterComponent: function () {
        var filterComponent = this.layout.getComponent('dashablelist-filter');
        if (filterComponent) {
            return;
        }
        this.layout.initComponents([{layout: 'dashablelist-filter'}]);
    },
    _getAvailableModules: function () {
        if (_.isEmpty(this._availableModules) || !_.isObject(this._availableModules)) {
            this._availableModules = {};
            var visibleModules = app.metadata.getModuleNames({
                filter: 'visible',
                access: 'read'
            }), allowedModules = _.difference(visibleModules, this.moduleBlacklist);
            _.each(this.additionalModules, function (extraModules, module) {
                if (_.contains(allowedModules, module)) {
                    allowedModules = _.sortBy(_.union(allowedModules, extraModules), function (name) {
                        return name
                    });
                }
            });
            _.each(allowedModules, function (module) {
                var hasListView = !_.isEmpty(this.getFieldMetaForView(app.metadata.getView(module, 'list')));
                if (hasListView) {
                    this._availableModules[module] = app.lang.getModuleName(module, {plural: true});
                }
            }, this);
        }
        return this._availableModules;
    },
    _getListMeta: function (module) {
        return app.metadata.getView(module, 'list');
    },
    _getAvailableColumns: function () {
        var columns = {}, module = this.settings.get('module');
        if (!module) {
            return columns;
        }
        _.each(this.getFieldMetaForView(this._getListMeta(module)), function (field) {
            columns[field.name] = app.lang.get(field.label || field.name, module);
        });
        return columns;
    },
    _displayDashlet: function (filterDef) {
        var columns = this._getColumnsForDisplay();
        this.meta.panels = [{fields: columns}];
        this.context.set('skipFetch', false);
        this.context.set('limit', this.settings.get('limit'));
        this.context.set('fields', this.getFieldNames());
        if (filterDef) {
            this._applyFilterDef(filterDef);
            this.context.reloadData({'recursive': false});
        }
        this._startAutoRefresh();
    },
    _applyFilterDef: function (filterDef) {
        if (filterDef) {
            filterDef = _.isArray(filterDef) ? filterDef : [filterDef];
            var specialField = /^\$/, meta = app.metadata.getModule(this.module);
            filterDef = _.filter(filterDef, function (def) {
                var fieldName = _.keys(def).pop();
                return specialField.test(fieldName) || meta.fields[fieldName];
            }, this);
            this.context.get('collection').filterDef = filterDef;
        }
    },
    _getColumnsForDisplay: function () {
        var columns = [];
        var fields = this.getFieldMetaForView(this._getListMeta(this.settings.get('module')));
        var moduleMeta = app.metadata.getModule(this.module);
        if (!this.settings.get('display_columns')) {
            this._updateDisplayColumns();
        }
        if (!this.settings.get('linked_fields')) {
            this.updateLinkedFields(this.model.module);
        }
        _.each(this.settings.get('display_columns'), function (name) {
            var field = _.find(fields, function (field) {
                return field.name === name;
            }, this);
            field = field || app.metadata._patchFields(this.module, moduleMeta, [name]);
            var sortableFlag, column, fieldDef = app.metadata.getModule(this.module).fields[field.name];
            if (_.isUndefined(fieldDef) || _.isUndefined(fieldDef.sortable)) {
                sortableFlag = true;
            } else {
                sortableFlag = !!fieldDef.sortable;
            }
            column = _.extend({sortable: sortableFlag}, field);
            columns.push(column);
        }, this);
        return columns;
    },
    _startAutoRefresh: function () {
        var refreshRate = parseInt(this.settings.get('auto_refresh'), 10);
        if (refreshRate) {
            this._stopAutoRefresh();
            this._timerId = setInterval(_.bind(function () {
                this.context.resetLoadFlag();
                this.layout.loadData();
            }, this), refreshRate * 1000 * 60);
        }
    },
    _stopAutoRefresh: function () {
        if (this._timerId) {
            clearInterval(this._timerId);
        }
    },
    _dispose: function () {
        this._stopAutoRefresh();
        this._super('_dispose');
    },
    getFieldMetaForView: function (meta) {
        meta = _.isObject(meta) ? meta : {};
        return !_.isUndefined(meta.panels) ? _.flatten(_.pluck(meta.panels, 'fields')) : [];
    },
    sort: $.noop
})