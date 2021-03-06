/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { Widget } from 'vs/base/browser/ui/widget';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IInputValidator, HistoryInputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Event as CommonEvent, Emitter } from 'vs/base/common/event';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachInputBoxStyler, attachCheckboxStyler } from 'vs/platform/theme/common/styler';
import { ContextScopedHistoryInputBox } from 'vs/platform/browser/contextScopedHistoryWidget';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ISearchConfigurationProperties } from 'vs/workbench/services/search/common/search';
import { Delayer } from 'vs/base/common/async';

export interface IOptions {
	placeholder?: string;
	width?: number;
	validation?: IInputValidator;
	ariaLabel?: string;
	history?: string[];
	submitOnType?: boolean;
	submitOnTypeDelay?: number;
}

export class PatternInputWidget extends Widget {

	static OPTION_CHANGE: string = 'optionChange';

	inputFocusTracker!: dom.IFocusTracker;

	private width: number;
	private placeholder: string;
	private ariaLabel: string;

	private domNode!: HTMLElement;
	protected inputBox!: HistoryInputBox;

	private _onSubmit = this._register(new Emitter<void>());
	onSubmit: CommonEvent<void> = this._onSubmit.event;

	private _onCancel = this._register(new Emitter<void>());
	onCancel: CommonEvent<void> = this._onCancel.event;

	private searchOnTypeDelayer: Delayer<void>;

	constructor(parent: HTMLElement, private contextViewProvider: IContextViewProvider, options: IOptions = Object.create(null),
		@IThemeService protected themeService: IThemeService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
		this.width = options.width || 100;
		this.placeholder = options.placeholder || '';
		this.ariaLabel = options.ariaLabel || nls.localize('defaultLabel', "input");

		this._register(this.searchOnTypeDelayer = new Delayer(this.searchConfig.searchOnTypeDebouncePeriod));

		this.render(options);

		parent.appendChild(this.domNode);
	}

	dispose(): void {
		super.dispose();
		if (this.inputFocusTracker) {
			this.inputFocusTracker.dispose();
		}
	}

	setWidth(newWidth: number): void {
		this.width = newWidth;
		this.domNode.style.width = this.width + 'px';
		this.contextViewProvider.layout();
		this.setInputWidth();
	}

	getValue(): string {
		return this.inputBox.value;
	}

	setValue(value: string): void {
		if (this.inputBox.value !== value) {
			this.inputBox.value = value;
		}
	}


	select(): void {
		this.inputBox.select();
	}

	focus(): void {
		this.inputBox.focus();
	}

	inputHasFocus(): boolean {
		return this.inputBox.hasFocus();
	}

	private setInputWidth(): void {
		this.inputBox.width = this.width - this.getSubcontrolsWidth() - 2; // 2 for input box border
	}

	protected getSubcontrolsWidth(): number {
		return 0;
	}

	getHistory(): string[] {
		return this.inputBox.getHistory();
	}

	clearHistory(): void {
		this.inputBox.clearHistory();
	}

	onSearchSubmit(): void {
		this.inputBox.addToHistory();
	}

	showNextTerm() {
		this.inputBox.showNextValue();
	}

	showPreviousTerm() {
		this.inputBox.showPreviousValue();
	}

	private render(options: IOptions): void {
		this.domNode = document.createElement('div');
		this.domNode.style.width = this.width + 'px';
		dom.addClass(this.domNode, 'monaco-findInput');

		this.inputBox = new ContextScopedHistoryInputBox(this.domNode, this.contextViewProvider, {
			placeholder: this.placeholder || '',
			ariaLabel: this.ariaLabel || '',
			validationOptions: {
				validation: undefined
			},
			history: options.history || []
		}, this.contextKeyService);
		this._register(attachInputBoxStyler(this.inputBox, this.themeService));
		this.inputFocusTracker = dom.trackFocus(this.inputBox.inputElement);
		this.onkeyup(this.inputBox.inputElement, (keyboardEvent) => this.onInputKeyUp(keyboardEvent));
		this._register(this.inputBox.onDidChange(() => {
			if (this.searchConfig.searchOnType) {
				this._onCancel.fire();
				this.searchOnTypeDelayer.trigger(() => this._onSubmit.fire(), this.searchConfig.searchOnTypeDebouncePeriod);
			}
		}));

		const controls = document.createElement('div');
		controls.className = 'controls';
		this.renderSubcontrols(controls);

		this.domNode.appendChild(controls);
		this.setInputWidth();
	}

	protected renderSubcontrols(_controlsDiv: HTMLDivElement): void {
	}

	private onInputKeyUp(keyboardEvent: IKeyboardEvent) {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				this._onSubmit.fire();
				return;
			case KeyCode.Escape:
				this._onCancel.fire();
				return;
			default:
				return;
		}
	}

	private get searchConfig() {
		return this.configurationService.getValue<ISearchConfigurationProperties>('search');
	}
}

export class ExcludePatternInputWidget extends PatternInputWidget {

	private _onChangeIgnoreBoxEmitter = this._register(new Emitter<void>());
	onChangeIgnoreBox = this._onChangeIgnoreBoxEmitter.event;

	constructor(parent: HTMLElement, contextViewProvider: IContextViewProvider, options: IOptions = Object.create(null),
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(parent, contextViewProvider, options, themeService, configurationService, contextKeyService);
	}

	private useExcludesAndIgnoreFilesBox!: Checkbox;

	dispose(): void {
		super.dispose();
		this.useExcludesAndIgnoreFilesBox.dispose();
	}

	useExcludesAndIgnoreFiles(): boolean {
		return this.useExcludesAndIgnoreFilesBox.checked;
	}

	setUseExcludesAndIgnoreFiles(value: boolean) {
		this.useExcludesAndIgnoreFilesBox.checked = value;
	}

	protected getSubcontrolsWidth(): number {
		return super.getSubcontrolsWidth() + this.useExcludesAndIgnoreFilesBox.width();
	}

	protected renderSubcontrols(controlsDiv: HTMLDivElement): void {
		this.useExcludesAndIgnoreFilesBox = this._register(new Checkbox({
			actionClassName: 'useExcludesAndIgnoreFiles codicon-exclude',
			title: nls.localize('useExcludesAndIgnoreFilesDescription', "Use Exclude Settings and Ignore Files"),
			isChecked: true,
		}));
		this._register(this.useExcludesAndIgnoreFilesBox.onChange(viaKeyboard => {
			this._onChangeIgnoreBoxEmitter.fire();
			if (!viaKeyboard) {
				this.inputBox.focus();
			}
		}));
		this._register(attachCheckboxStyler(this.useExcludesAndIgnoreFilesBox, this.themeService));

		controlsDiv.appendChild(this.useExcludesAndIgnoreFilesBox.domNode);
		super.renderSubcontrols(controlsDiv);
	}
}
