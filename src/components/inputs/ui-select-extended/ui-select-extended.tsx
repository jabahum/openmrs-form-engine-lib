import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ComboBox, InlineLoading } from '@carbon/react';
import { OHRIFormFieldProps } from '../../../api/types';
import { useField } from 'formik';
import styles from './ui-select-extended.scss';
import { OHRIFormContext } from '../../../ohri-form-context';
import { getConceptNameAndUUID } from '../../../utils/ohri-form-helper';
import { OHRIFieldValueView } from '../../value/view/ohri-field-value-view.component';
import { isTrue } from '../../../utils/boolean-utils';
import { fieldRequiredErrCode, isEmpty } from '../../../validators/ohri-form-validator';
import { PreviousValueReview } from '../../previous-value-review/previous-value-review.component';
import debounce from 'lodash-es/debounce';
import { useTranslation } from 'react-i18next';
import { getRegisteredDataSource } from '../../../registry/registry';
import { getControlTemplate } from '../../../registry/inbuilt-components/control-templates';

const UISelectExtended: React.FC<OHRIFormFieldProps> = ({ question, handler, onChange }) => {
  const { t } = useTranslation();
  const [field, meta] = useField(question.id);
  const { setFieldValue, encounterContext, fields } = React.useContext(OHRIFormContext);
  const [conceptName, setConceptName] = useState('Loading...');
  const [items, setItems] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [errors, setErrors] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const isFieldRequiredError = useMemo(() => errors[0]?.errCode == fieldRequiredErrCode, [errors]);
  const [previousValueForReview, setPreviousValueForReview] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const isProcessingSelection = useRef(false);
  const [dataSource, setDataSource] = useState(null);
  const [config, setConfig] = useState({});
  const [savedSearchableItem, setSavedSearchableItem] = useState({});

  interface DisplayableItem {
    uuid: string;
    display: string;
  }

  useEffect(() => {
    const datasourceName = question.questionOptions?.datasource?.name;
    setConfig(
      datasourceName
        ? question.questionOptions.datasource?.config
        : getControlTemplate(question.questionOptions.rendering)?.datasource?.config,
    );
    getRegisteredDataSource(datasourceName ? datasourceName : question.questionOptions.rendering).then((ds) =>
      setDataSource(ds),
    );
  }, [question.questionOptions?.datasource]);

  useEffect(() => {
    if (question['submission']) {
      question['submission'].errors && setErrors(question['submission'].errors);
      question['submission'].warnings && setWarnings(question['submission'].warnings);
    }
  }, [question['submission']]);

  const handleChange = (value) => {
    setFieldValue(question.id, value);
    onChange(question.id, value, setErrors, setWarnings);
    question.value = handler?.handleFieldSubmission(question, value, encounterContext);
  };

  const debouncedSearch = debounce((searchterm, dataSource) => {
    setItems([]);
    setIsLoading(true);
    dataSource.fetchData(searchterm, config).then((dataItems) => {
      setItems(dataItems.map(dataSource.toUuidAndDisplay));

      setIsLoading(false);
    });
  }, 300);

  const processSearchableValues = (value) => {
    dataSource.fetchData(null, config, value).then((dataItem) => {
      setSavedSearchableItem(dataItem);
      setIsLoading(false);
    });
  };

  useEffect(() => {
    // If not searchable, preload the items
    if (dataSource && !isTrue(question.questionOptions.isSearchable)) {
      setIsLoading(true);
      dataSource.fetchData(null, config).then((dataItems) => {
        setItems(dataItems.map(dataSource.toUuidAndDisplay));
        setIsLoading(false);
      });
    }
  }, [dataSource, config]);

  useEffect(() => {
    if (dataSource && isTrue(question.questionOptions.isSearchable) && !isEmpty(searchTerm)) {
      debouncedSearch(searchTerm, dataSource);
    }
  }, [dataSource, searchTerm, config]);

  useEffect(() => {
    if (
      dataSource &&
      isTrue(question.questionOptions.isSearchable) &&
      isEmpty(searchTerm) &&
      field.value &&
      !Object.keys(savedSearchableItem).length
    ) {
      setIsLoading(true);
      processSearchableValues(field.value);
    }
  }, [field.value]);

  useEffect(() => {
    getConceptNameAndUUID(question.questionOptions.concept).then((conceptTooltip) => {
      setConceptName(conceptTooltip);
    });
  }, [conceptName]);

  useEffect(() => {
    if (encounterContext?.previousEncounter && !question.questionOptions.usePreviousValueDisabled) {
      const prevValue = handler?.getPreviousValue(question, encounterContext?.previousEncounter, fields);
      if (!isEmpty(prevValue?.value)) {
        setPreviousValueForReview(prevValue);
        if (question.questionOptions.isSearchable) {
          processSearchableValues(prevValue.value);
        }
      }
    }
  }, [encounterContext?.previousEncounter]);

  return encounterContext.sessionMode == 'view' || isTrue(question.readonly) ? (
    <div className={styles.formField}>
      <OHRIFieldValueView
        label={question.label}
        value={
          field.value
            ? handler?.getDisplayValue(question, items.find((item) => item.uuid == field.value)?.display)
            : field.value
        }
        conceptName={conceptName}
        isInline
      />
    </div>
  ) : (
    !question.isHidden && (
      <>
        <div className={`${styles.formInputField} ${styles.row}`}>
          <div
            className={
              isFieldRequiredError
                ? `${styles.errorLabel} ${styles.multiselectOverride}`
                : `${styles.multiselectOverride}`
            }>
            <ComboBox
              id={question.id}
              titleText={question.label}
              items={items}
              itemToString={(item) => item?.display}
              selectedItem={
                encounterContext.sessionMode === 'enter'
                  ? items.find((item) => item.uuid == field.value)
                  : items.find((item) => item.uuid == field.value) || savedSearchableItem
              }
              shouldFilterItem={({ item, inputValue }) => {
                if (!inputValue) {
                  // Carbon's initial call at component mount
                  return true;
                }
                return item.display?.toLowerCase().includes(inputValue.toLowerCase());
              }}
              onChange={({ selectedItem }) => {
                isProcessingSelection.current = true;
                handleChange(selectedItem?.uuid);
              }}
              disabled={question.disabled}
              readOnly={question.readonly}
              onInputChange={(value) => {
                if (isProcessingSelection.current) {
                  // Notes:
                  // When the user selects a value, both the onChange and onInputChange functions are invoked sequentially.
                  // Issue: onInputChange modifies the search term, unnecessarily triggering a search.
                  isProcessingSelection.current = false;
                  return;
                }

                if (question.questionOptions.isSearchable) {
                  setSearchTerm(value);
                }
              }}
            />
          </div>
          {previousValueForReview && (
            <div>
              <PreviousValueReview
                value={previousValueForReview.value}
                displayText={
                  items.find((item) => item.uuid == previousValueForReview.value)?.display ||
                  (savedSearchableItem as DisplayableItem).display
                }
                setValue={handleChange}
              />
            </div>
          )}
        </div>
        {isLoading && <InlineLoading className={styles.loader} description={t('loading', 'Loading') + '...'} />}
      </>
    )
  );
};

export default UISelectExtended;
