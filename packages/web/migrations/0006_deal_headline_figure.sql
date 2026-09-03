-- P3: the pipeline board card shows ONE strategy-appropriate key figure (BTL monthly
-- cashflow, BRRRR money left in, Flip profit, HMO ROI). That figure must match exactly
-- what the analyser shows when the card is opened, and the analyser's figure depends on
-- the ONS country (England/Wales → SDLT/LTT) which is only known at analyse time — so it
-- cannot be honestly recomputed on the board. We store the analyser's own display string
-- at save/re-score time. Nullable: migrated/older deals fall back to saved_deals.key_figure.
ALTER TABLE deals ADD COLUMN headline_figure TEXT;
